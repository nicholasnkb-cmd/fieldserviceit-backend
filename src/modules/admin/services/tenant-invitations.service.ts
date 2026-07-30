import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { EmailService } from '../../notifications/services/email.service';
import { hashCredential } from '../../../common/security/credential-hash';
import { assertPasswordPolicy } from '../../../common/security/password-policy';
import { CurrentUser } from '../../../common/types';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../auth/legal-consent';
import { AcceptTenantInvitationDto, CreateTenantInvitationDto, TENANT_INVITATION_ROLES } from '../dto/tenant-invitation.dto';

@Injectable()
export class TenantInvitationsService {
  constructor(private readonly db: PrismaService, private readonly email: EmailService) {}

  async create(companyId: string, actor: CurrentUser, dto: CreateTenantInvitationDto) {
    const email = dto.email.trim().toLowerCase();
    const role = dto.role || 'CLIENT';
    if (!TENANT_INVITATION_ROLES.includes(role)) throw new BadRequestException('Invalid invitation role');
    const existing = await this.db.query<any[]>(
      `SELECT id FROM User WHERE email = ? AND deletedAt IS NULL LIMIT 1`, [email],
    );
    if (existing[0]) throw new ConflictException('A user with this email already exists');
    const companies = await this.db.query<any[]>(`SELECT id, name FROM Company WHERE id = ? AND isActive = 1 LIMIT 1`, [companyId]);
    if (!companies[0]) throw new NotFoundException('Company not found');

    const id = crypto.randomUUID();
    const token = crypto.randomBytes(32).toString('base64url');
    await this.db.transaction(async (tx) => {
      await tx.execute(
        `UPDATE TenantUserInvitation SET revokedAt = NOW(3)
         WHERE companyId = ? AND email = ? AND acceptedAt IS NULL AND revokedAt IS NULL`,
        [companyId, email],
      );
      await tx.execute(
        `INSERT INTO TenantUserInvitation
         (id, companyId, email, role, tokenHash, invitedById, expiresAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 7 DAY), NOW(3))`,
        [id, companyId, email, role, hashCredential(token), actor.id],
      );
    });

    const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invitations/accept?token=${encodeURIComponent(token)}`;
    await this.email.sendNotificationEmail(
      email,
      `You're invited to join ${companies[0].name} on FieldserviceIT`,
      `<p>${this.escape(actor.email)} invited you to join <strong>${this.escape(companies[0].name)}</strong> on FieldserviceIT.</p><p><a href="${url}">Accept invitation</a></p><p>This invitation expires in 7 days.</p>`,
      { text: `${actor.email} invited you to join ${companies[0].name} on FieldserviceIT. Accept within 7 days: ${url}` },
    );
    await this.audit(companyId, actor.id, 'TENANT_USER_INVITED', id, { email, role });
    return { id, email, role, expiresInDays: 7 };
  }

  list(companyId: string) {
    return this.db.query(
      `SELECT invitation.id, invitation.email, invitation.role, invitation.expiresAt,
              invitation.acceptedAt, invitation.createdAt, inviter.email AS invitedByEmail
       FROM TenantUserInvitation invitation
       LEFT JOIN User inviter ON inviter.id = invitation.invitedById
       WHERE invitation.companyId = ? AND invitation.revokedAt IS NULL
       ORDER BY invitation.createdAt DESC LIMIT 100`,
      [companyId],
    );
  }

  async revoke(companyId: string, actor: CurrentUser, id: string) {
    const result = await this.db.execute(
      `UPDATE TenantUserInvitation SET revokedAt = NOW(3)
       WHERE id = ? AND companyId = ? AND acceptedAt IS NULL AND revokedAt IS NULL`,
      [id, companyId],
    );
    if (!result.affectedRows) throw new NotFoundException('Pending invitation not found');
    await this.audit(companyId, actor.id, 'TENANT_USER_INVITATION_REVOKED', id, {});
    return { revoked: true };
  }

  async inspect(token: string) {
    const invitation = await this.findActive(token);
    return {
      email: invitation.email,
      role: invitation.role,
      companyName: invitation.companyName,
      expiresAt: invitation.expiresAt,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    };
  }

  async accept(token: string, dto: AcceptTenantInvitationDto, context: { ipAddress?: string; userAgent?: string }) {
    const invitation = await this.findActive(token);
    assertPasswordPolicy(dto.password, [invitation.email, dto.firstName, dto.lastName]);
    if (!dto.termsAccepted || dto.termsVersion !== TERMS_VERSION || dto.privacyVersion !== PRIVACY_VERSION) {
      throw new BadRequestException('Review and accept the current Terms of Service and Privacy Policy');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const userId = crypto.randomUUID();
    await this.db.transaction(async (tx) => {
      const locked = await tx.query<any[]>(
        `SELECT id FROM TenantUserInvitation
         WHERE id = ? AND tokenHash = ? AND acceptedAt IS NULL AND revokedAt IS NULL AND expiresAt > NOW(3)
         LIMIT 1 FOR UPDATE`,
        [invitation.id, hashCredential(token)],
      );
      if (!locked[0]) throw new BadRequestException('Invitation is invalid, expired, or already used');
      const users = await tx.query<any[]>(`SELECT id FROM User WHERE email = ? AND deletedAt IS NULL LIMIT 1`, [invitation.email]);
      if (users[0]) throw new ConflictException('A user with this email already exists');
      await tx.execute(
        `INSERT INTO User
         (id, email, passwordHash, firstName, lastName, role, userType, companyId, isActive, emailVerified, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 'BUSINESS', ?, 1, 1, NOW(3), NOW(3))`,
        [userId, invitation.email, passwordHash, dto.firstName.trim(), dto.lastName.trim(), invitation.role, invitation.companyId],
      );
      await tx.execute(
        `INSERT INTO UserLegalConsent
         (id, userId, termsVersion, privacyVersion, ipAddress, userAgent, acceptedAt)
         VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
        [crypto.randomUUID(), userId, TERMS_VERSION, PRIVACY_VERSION, context.ipAddress || null, context.userAgent?.slice(0, 500) || null],
      );
      await tx.execute(`UPDATE TenantUserInvitation SET acceptedAt = NOW(3) WHERE id = ?`, [invitation.id]);
    });
    await this.audit(invitation.companyId, userId, 'TENANT_USER_INVITATION_ACCEPTED', invitation.id, { email: invitation.email });
    return { accepted: true, email: invitation.email, companyName: invitation.companyName };
  }

  private async findActive(token: string) {
    const rows = await this.db.query<any[]>(
      `SELECT invitation.*, company.name AS companyName
       FROM TenantUserInvitation invitation
       JOIN Company company ON company.id = invitation.companyId AND company.isActive = 1
       WHERE invitation.tokenHash = ? AND invitation.acceptedAt IS NULL
         AND invitation.revokedAt IS NULL AND invitation.expiresAt > NOW(3) LIMIT 1`,
      [hashCredential(token)],
    );
    if (!rows[0]) throw new BadRequestException('Invitation is invalid, expired, or already used');
    return rows[0];
  }

  private audit(companyId: string, actorId: string, action: string, resourceId: string, diff: Record<string, any>) {
    return this.db.execute(
      `INSERT INTO AuditLog (id, companyId, actorId, action, resourceType, resourceId, diff, createdAt)
       VALUES (?, ?, ?, ?, 'TenantUserInvitation', ?, ?, NOW(3))`,
      [crypto.randomUUID(), companyId, actorId, action, resourceId, JSON.stringify(diff)],
    );
  }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
  }
}
