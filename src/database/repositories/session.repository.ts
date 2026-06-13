import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { credentialLookupValues, hashCredential } from '../../common/security/credential-hash';

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByRefreshToken(refreshToken: string, includeUser = false) {
    const [hashed, legacy] = credentialLookupValues(refreshToken);
    const rows = await this.prisma.query<any[]>(
      `SELECT * FROM Session
       WHERE refreshToken IN (?, ?)
       ORDER BY CASE WHEN refreshToken = ? THEN 0 ELSE 1 END
       LIMIT 1`,
      [hashed, legacy, hashed],
    );
    const session = rows[0] || null;
    if (session && includeUser) {
      session.user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    }
    return session;
  }

  hashRefreshToken(refreshToken: string): string {
    return hashCredential(refreshToken);
  }

  async revokeByRefreshToken(refreshToken: string, reason: string) {
    const [hashed, legacy] = credentialLookupValues(refreshToken);
    return this.prisma.execute(
      `UPDATE Session SET revokedAt = NOW(3), revokeReason = ?
       WHERE refreshToken IN (?, ?)`,
      [reason, hashed, legacy],
    );
  }

  async revokeActiveFamily(userId: string, reason: string) {
    return this.prisma.execute(
      `UPDATE Session SET revokedAt = NOW(3), revokeReason = ?
       WHERE userId = ? AND revokedAt IS NULL`,
      [reason, userId],
    );
  }

  async recordRotation(sessionId: string, userId: string, previousRefreshToken: string, expiresAt: Date) {
    return this.prisma.execute(
      `INSERT INTO SessionRefreshHistory
       (id, sessionId, userId, tokenHash, expiresAt, rotatedAt)
       VALUES (UUID(), ?, ?, ?, ?, NOW(3))`,
      [sessionId, userId, hashCredential(previousRefreshToken), expiresAt],
    );
  }

  async findReusedToken(refreshToken: string) {
    const rows = await this.prisma.query<any[]>(
      `SELECT h.sessionId, h.userId, u.companyId
       FROM SessionRefreshHistory h
       LEFT JOIN User u ON u.id = h.userId
       WHERE h.tokenHash = ? AND h.expiresAt > NOW(3)
       LIMIT 1`,
      [hashCredential(refreshToken)],
    ).catch(() => []);
    return rows[0] || null;
  }
}
