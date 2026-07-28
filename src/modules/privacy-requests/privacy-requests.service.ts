import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser } from '../../common/types';
import { CreatePrivacyRequestDto, UpdatePrivacyRequestDto } from './dto/privacy-request.dto';
import { EmailService } from '../notifications/services/email.service';
import { credentialMatches, hashCredential } from '../../common/security/credential-hash';
import { decryptSecret, encryptSecret } from '../../common/security/encryption';

@Injectable()
export class PrivacyRequestsService {
  constructor(private readonly db: PrismaService, private readonly email: EmailService) {}

  async create(dto: CreatePrivacyRequestDto, user?: CurrentUser) {
    const email = String(user?.email || dto.email).trim().toLowerCase();
    const account = user
      ? { id: user.id, companyId: user.companyId }
      : (await this.db.query<Array<{ id: string; companyId: string | null }>>(
          `SELECT id, companyId FROM User WHERE email = ? AND deletedAt IS NULL LIMIT 1`,
          [email],
        ))[0];

    const id = randomUUID();
    const verificationToken = randomBytes(32).toString('base64url');
    const jurisdiction = dto.jurisdiction?.trim() || null;
    const californiaRequest = /\b(CCPA|CPRA|CALIFORNIA|CA)\b/i.test(jurisdiction || '');
    const dueExpression = californiaRequest
      ? 'DATE_ADD(NOW(3), INTERVAL 45 DAY)'
      : 'DATE_ADD(NOW(3), INTERVAL 1 MONTH)';
    await this.db.execute(
      `INSERT INTO PrivacyRequest
       (id, companyId, userId, email, requestType, jurisdiction, details, status, verificationTokenHash,
        verificationExpiresAt, dueAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'VERIFYING', ?, DATE_ADD(NOW(3), INTERVAL 24 HOUR),
               ${dueExpression}, NOW(3), NOW(3))`,
      [id, account?.companyId || null, account?.id || null, email, dto.requestType, jurisdiction, dto.details?.trim() || null, hashCredential(verificationToken)],
    );
    await this.event(id, null, 'REQUEST_SUBMITTED', { requestType: dto.requestType });
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/privacy/verify?token=${encodeURIComponent(verificationToken)}`;
    await this.email.sendNotificationEmail(
      email,
      'Verify your FieldserviceIT privacy request',
      `<p>Verify your privacy request within 24 hours:</p><p><a href="${verificationUrl}">Verify privacy request</a></p><p>If you did not submit this request, no action is required.</p>`,
      { text: `Verify your privacy request within 24 hours: ${verificationUrl}` },
    ).catch(() => undefined);
    return this.getPublic(id, email);
  }

  async verify(token: string) {
    const rows = await this.db.query<any[]>(
      `SELECT id, verificationTokenHash FROM PrivacyRequest
       WHERE status = 'VERIFYING' AND verificationExpiresAt > NOW(3) AND verifiedAt IS NULL`,
    );
    const request = rows.find((row) => credentialMatches(token, row.verificationTokenHash));
    if (!request) throw new BadRequestException('Verification link is invalid or expired');
    const consumed = await this.db.execute(
      `UPDATE PrivacyRequest SET status = 'RECEIVED', verifiedAt = NOW(3), identityVerifiedAt = NOW(3),
         verificationTokenHash = NULL, updatedAt = NOW(3) WHERE id = ? AND verifiedAt IS NULL`,
      [request.id],
    );
    if (!consumed.affectedRows) throw new BadRequestException('Verification link is invalid or expired');
    await this.event(request.id, null, 'EMAIL_VERIFIED', {});
    return { verified: true };
  }

  async listMine(user: CurrentUser) {
    return this.db.query(
      `SELECT id, requestType, jurisdiction, status, dueAt, completedAt, createdAt, updatedAt
       FROM PrivacyRequest WHERE userId = ? OR (userId IS NULL AND email = ?)
       ORDER BY createdAt DESC LIMIT 100`,
      [user.id, user.email.toLowerCase()],
    );
  }

  async listForAdministration(user: CurrentUser) {
    const companyId = user.effectiveCompanyId || user.companyId;
    const where = user.role === 'SUPER_ADMIN' && !companyId ? '' : 'WHERE companyId = ?';
    const params = where ? [companyId] : [];
    return this.db.query(
      `SELECT id, companyId, userId, email, requestType, jurisdiction, details, status,
              identityVerifiedAt, assignedToId, resolutionNotes, dueAt, completedAt, verifiedAt,
              legalHoldAt, legalHoldReason, deletionApprovedAt, escalationNotifiedAt, createdAt, updatedAt
       FROM PrivacyRequest ${where} ORDER BY FIELD(status, 'RECEIVED', 'VERIFYING', 'IN_REVIEW', 'COMPLETED', 'DENIED', 'CANCELED'), dueAt ASC
       LIMIT 500`,
      params,
    );
  }

  async update(id: string, dto: UpdatePrivacyRequestDto, user: CurrentUser) {
    const companyId = user.effectiveCompanyId || user.companyId;
    const scope = user.role === 'SUPER_ADMIN' && !companyId ? '' : 'AND companyId = ?';
    const existing = await this.db.query<any[]>(
      `SELECT * FROM PrivacyRequest WHERE id = ? ${scope} LIMIT 1`,
      scope ? [id, companyId] : [id],
    );
    if (!existing[0]) throw new NotFoundException('Privacy request not found');
    if (dto.status === 'COMPLETED' && !existing[0].identityVerifiedAt && !dto.identityVerified) {
      throw new BadRequestException('Identity must be verified before completing a privacy request');
    }
    if (dto.status === 'DENIED' && !dto.resolutionNotes?.trim() && !existing[0].resolutionNotes) {
      throw new BadRequestException('A reason is required when denying a privacy request');
    }
    if (dto.legalHold && !dto.legalHoldReason?.trim()) throw new BadRequestException('A legal hold reason is required');
    if (dto.status === 'COMPLETED' && existing[0].requestType === 'DELETION') {
      if (existing[0].legalHoldAt || dto.legalHold) throw new BadRequestException('A request under legal hold cannot be deleted');
      if (!existing[0].deletionApprovedAt && !dto.deletionApproved) throw new BadRequestException('Deletion must be explicitly approved');
    }

    await this.db.execute(
      `UPDATE PrivacyRequest SET status = ?,
         identityVerifiedAt = CASE WHEN ? = 1 THEN COALESCE(identityVerifiedAt, NOW(3)) ELSE identityVerifiedAt END,
         assignedToId = COALESCE(?, assignedToId, ?), resolutionNotes = ?,
         legalHoldAt = CASE WHEN ? = 1 THEN COALESCE(legalHoldAt, NOW(3)) WHEN ? = 0 THEN NULL ELSE legalHoldAt END,
         legalHoldReason = CASE WHEN ? = 1 THEN ? WHEN ? = 0 THEN NULL ELSE legalHoldReason END,
         deletionApprovedAt = CASE WHEN ? = 1 THEN COALESCE(deletionApprovedAt, NOW(3)) ELSE deletionApprovedAt END,
         deletionApprovedById = CASE WHEN ? = 1 THEN ? ELSE deletionApprovedById END,
         completedAt = CASE WHEN ? IN ('COMPLETED', 'DENIED', 'CANCELED') THEN NOW(3) ELSE NULL END,
         updatedAt = NOW(3) WHERE id = ?`,
      [dto.status, dto.identityVerified ? 1 : 0, dto.assignedToId || null, user.id,
       dto.resolutionNotes?.trim() || existing[0].resolutionNotes || null,
       dto.legalHold === true ? 1 : dto.legalHold === false ? 0 : null,
       dto.legalHold === false ? 0 : 1,
       dto.legalHold === true ? 1 : dto.legalHold === false ? 0 : null,
       dto.legalHoldReason?.trim() || null,
       dto.legalHold === false ? 0 : 1,
       dto.deletionApproved ? 1 : 0, dto.deletionApproved ? 1 : 0, user.id,
       dto.status, id],
    );
    await this.db.execute(
      `INSERT INTO AuditLog (id, companyId, actorId, action, resourceType, resourceId, diff, createdAt)
       VALUES (?, ?, ?, 'PRIVACY_REQUEST_UPDATED', 'PrivacyRequest', ?, ?, NOW(3))`,
      [randomUUID(), existing[0].companyId || null, user.id, id, JSON.stringify({ status: dto.status, identityVerified: Boolean(dto.identityVerified), legalHold: dto.legalHold, deletionApproved: Boolean(dto.deletionApproved) })],
    );
    await this.event(id, user.id, 'REQUEST_UPDATED', { status: dto.status, assignedToId: dto.assignedToId || user.id });
    if (dto.status === 'COMPLETED' && existing[0].status !== 'COMPLETED' && ['ACCESS', 'EXPORT'].includes(existing[0].requestType)) {
      await this.createExportArtifact(existing[0], user.id);
    }
    if (dto.status === 'COMPLETED' && existing[0].status !== 'COMPLETED' && existing[0].requestType === 'DELETION') {
      await this.db.execute(
        `INSERT INTO PrivacyActionJob (id, requestId, actionType, status, approvedById, approvedAt, createdAt)
         VALUES (?, ?, 'DELETION', 'APPROVED', ?, NOW(3), NOW(3))`,
        [randomUUID(), id, user.id],
      );
      await this.event(id, user.id, 'DELETION_APPROVED', {});
    }
    return (await this.db.query<any[]>(`SELECT * FROM PrivacyRequest WHERE id = ? LIMIT 1`, [id]))[0];
  }

  async downloadExport(token: string) {
    const rows = await this.db.query<any[]>(
      `SELECT id, requestId, tokenHash, content FROM PrivacyExportArtifact
       WHERE downloadedAt IS NULL AND expiresAt > NOW(3)`,
    );
    const artifact = rows.find((row) => credentialMatches(token, row.tokenHash));
    if (!artifact) throw new BadRequestException('Export link is invalid, expired, or already used');
    const consumed = await this.db.execute(`UPDATE PrivacyExportArtifact SET downloadedAt = NOW(3) WHERE id = ? AND downloadedAt IS NULL`, [artifact.id]);
    if (!consumed.affectedRows) throw new BadRequestException('Export link is invalid, expired, or already used');
    await this.event(artifact.requestId, null, 'EXPORT_DOWNLOADED', {});
    return JSON.parse(decryptSecret(artifact.content));
  }

  async evidence(id: string, user: CurrentUser) {
    const companyId = user.effectiveCompanyId || user.companyId;
    const scope = user.role === 'SUPER_ADMIN' && !companyId ? '' : 'AND companyId = ?';
    const requests = await this.db.query<any[]>(`SELECT * FROM PrivacyRequest WHERE id = ? ${scope} LIMIT 1`, scope ? [id, companyId] : [id]);
    if (!requests[0]) throw new NotFoundException('Privacy request not found');
    const events = await this.db.query<any[]>(
      `SELECT eventType, actorId, detail, createdAt FROM PrivacyRequestEvent WHERE requestId = ? ORDER BY createdAt ASC`,
      [id],
    );
    const jobs = await this.db.query<any[]>(
      `SELECT actionType, status, approvedById, approvedAt, executedAt, resultDetail FROM PrivacyActionJob WHERE requestId = ?`,
      [id],
    );
    return { generatedAt: new Date(), request: requests[0], events, jobs };
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async notifyApproachingDeadlines() {
    const requests = await this.db.query<any[]>(
      `SELECT id, companyId, email, requestType, dueAt FROM PrivacyRequest
       WHERE status IN ('RECEIVED', 'IN_REVIEW') AND dueAt <= DATE_ADD(NOW(3), INTERVAL 5 DAY)
         AND escalationNotifiedAt IS NULL LIMIT 100`,
    ).catch(() => []);
    for (const request of requests) {
      const admins = await this.db.query<any[]>(
        `SELECT email FROM User WHERE isActive = 1 AND deletedAt IS NULL
         AND (role = 'SUPER_ADMIN' OR (role = 'TENANT_ADMIN' AND companyId = ?))`,
        [request.companyId],
      );
      await Promise.all(admins.map((admin) => this.email.sendNotificationEmail(
        admin.email,
        'Privacy request deadline approaching',
        `<p>${request.requestType} request ${request.id} is due ${new Date(request.dueAt).toISOString()}.</p>`,
      ).catch(() => undefined)));
      await this.db.execute(`UPDATE PrivacyRequest SET escalationNotifiedAt = NOW(3) WHERE id = ? AND escalationNotifiedAt IS NULL`, [request.id]);
      await this.event(request.id, null, 'DEADLINE_ESCALATED', {});
    }
  }

  private async createExportArtifact(request: any, actorId: string) {
    const users = request.userId ? await this.db.query<any[]>(
      `SELECT id, email, firstName, lastName, phone, jobTitle, department, location, preferredContactMethod,
              timezone, companyId, createdAt, updatedAt FROM User WHERE id = ? LIMIT 1`,
      [request.userId],
    ) : [];
    const tickets = request.userId ? await this.db.query<any[]>(
      `SELECT id, ticketNumber, title, description, status, priority, type, createdAt, updatedAt
       FROM Ticket WHERE createdById = ? AND deletedAt IS NULL ORDER BY createdAt DESC LIMIT 5000`,
      [request.userId],
    ) : [];
    const token = randomBytes(32).toString('base64url');
    const artifactId = randomUUID();
    const content = JSON.stringify({ generatedAt: new Date(), requestId: request.id, account: users[0] || { email: request.email }, tickets });
    await this.db.execute(
      `INSERT INTO PrivacyExportArtifact (id, requestId, tokenHash, content, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 24 HOUR), NOW(3))`,
      [artifactId, request.id, hashCredential(token), encryptSecret(content)],
    );
    const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/privacy/export?token=${encodeURIComponent(token)}`;
    await this.email.sendNotificationEmail(
      request.email,
      'Your FieldserviceIT privacy export is ready',
      `<p>Your privacy export is ready. This one-time link expires in 24 hours:</p><p><a href="${url}">Download privacy export</a></p>`,
      { text: `Your one-time privacy export link expires in 24 hours: ${url}` },
    ).catch(() => undefined);
    await this.event(request.id, actorId, 'EXPORT_CREATED', { expiresInHours: 24 });
  }

  private event(requestId: string, actorId: string | null, eventType: string, detail: Record<string, any>) {
    return this.db.execute(
      `INSERT INTO PrivacyRequestEvent (id, requestId, actorId, eventType, detail, createdAt)
       VALUES (?, ?, ?, ?, ?, NOW(3))`,
      [randomUUID(), requestId, actorId, eventType, JSON.stringify(detail)],
    );
  }

  private async getPublic(id: string, email: string) {
    const rows = await this.db.query<any[]>(
      `SELECT id, requestType, status, dueAt, createdAt FROM PrivacyRequest WHERE id = ? AND email = ? LIMIT 1`,
      [id, email],
    );
    return rows[0];
  }
}
