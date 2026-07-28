import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { CurrentUser } from '../../../common/types';
import { EmailService } from '../../notifications/services/email.service';
import { CreateMfaResetRequestDto, ReviewMfaResetRequestDto } from '../dto/mfa-reset.dto';

@Injectable()
export class MfaResetService {
  constructor(private readonly db: PrismaService, private readonly email: EmailService) {}

  async create(dto: CreateMfaResetRequestDto) {
    const email = dto.email.trim().toLowerCase();
    const users = await this.db.query<any[]>(`SELECT id FROM User WHERE email = ? AND isActive = 1 LIMIT 1`, [email]);
    const userId = users[0]?.id || null;
    if (userId) {
      const active = await this.db.query<any[]>(
        `SELECT id FROM MfaResetRequest WHERE userId = ? AND status = 'PENDING' ORDER BY createdAt DESC LIMIT 1`,
        [userId],
      );
      if (!active[0]) {
        await this.db.execute(
          `INSERT INTO MfaResetRequest (id, userId, email, reason, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 'PENDING', NOW(3), NOW(3))`,
          [randomUUID(), userId, email, dto.reason?.trim() || null],
        );
      }
    }
    return { received: true, message: 'If the account is eligible, an administrator will review the request.' };
  }

  async list(user: CurrentUser) {
    const companyId = user.effectiveCompanyId || user.companyId;
    const tenantScope = user.role === 'SUPER_ADMIN' && !companyId ? '' : 'AND account.companyId = ?';
    return this.db.query(
      `SELECT request.id, request.email, request.reason, request.status, request.reviewNotes,
              request.createdAt, request.reviewedAt, account.companyId
       FROM MfaResetRequest request
       LEFT JOIN User account ON account.id = request.userId
       WHERE 1 = 1 ${tenantScope}
       ORDER BY FIELD(request.status, 'PENDING', 'APPROVED', 'DENIED'), request.createdAt ASC LIMIT 250`,
      tenantScope ? [companyId] : [],
    );
  }

  async review(id: string, dto: ReviewMfaResetRequestDto, actor: CurrentUser) {
    if (!dto.reviewNotes?.trim()) throw new BadRequestException('Review notes are required');
    const companyId = actor.effectiveCompanyId || actor.companyId;
    const tenantScope = actor.role === 'SUPER_ADMIN' && !companyId ? '' : 'AND account.companyId = ?';
    const request = await this.db.transaction(async (connection) => {
      const rows = await connection.query<any[]>(
        `SELECT request.*, account.companyId FROM MfaResetRequest request
         LEFT JOIN User account ON account.id = request.userId
         WHERE request.id = ? AND request.status = 'PENDING' ${tenantScope} LIMIT 1 FOR UPDATE`,
        tenantScope ? [id, companyId] : [id],
      );
      const lockedRequest = rows[0];
      if (!lockedRequest) throw new NotFoundException('MFA reset request not found');
      if (dto.status === 'APPROVED' && lockedRequest.userId) {
        await connection.execute(
          `UPDATE User SET mfaEnabled = 0, mfaSecretEncrypted = NULL, mfaPendingSecretEncrypted = NULL,
             mfaRecoveryCodes = NULL, mfaEnabledAt = NULL, authVersion = authVersion + 1, updatedAt = NOW(3)
           WHERE id = ?`,
          [lockedRequest.userId],
        );
        await connection.execute(
          `UPDATE Session SET revokedAt = NOW(3), revokedById = ?, revokeReason = 'approved-mfa-reset'
           WHERE userId = ? AND revokedAt IS NULL`,
          [actor.id, lockedRequest.userId],
        );
      }
      await connection.execute(
        `UPDATE MfaResetRequest SET status = ?, reviewedById = ?, reviewNotes = ?, reviewedAt = NOW(3), updatedAt = NOW(3)
         WHERE id = ? AND status = 'PENDING'`,
        [dto.status, actor.id, dto.reviewNotes.trim(), id],
      );
      return lockedRequest;
    });
    await this.db.execute(
      `INSERT INTO AuditLog (id, companyId, actorId, action, resourceType, resourceId, diff, createdAt)
       VALUES (?, ?, ?, 'MFA_RESET_REVIEWED', 'MfaResetRequest', ?, ?, NOW(3))`,
      [randomUUID(), request.companyId || null, actor.id, id, JSON.stringify({ status: dto.status })],
    );
    await this.email.sendNotificationEmail(
      request.email,
      `MFA reset request ${dto.status.toLowerCase()}`,
      `<p>Your FieldserviceIT MFA reset request was ${dto.status.toLowerCase()}.</p><p>${this.escape(dto.reviewNotes.trim())}</p>`,
      { text: `Your MFA reset request was ${dto.status.toLowerCase()}. ${dto.reviewNotes.trim()}` },
    ).catch(() => undefined);
    return { status: dto.status };
  }

  private escape(value: string) {
    return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
  }
}
