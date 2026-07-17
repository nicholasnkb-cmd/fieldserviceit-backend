import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ScimTokenGuard implements CanActivate {
  private readonly logger = new Logger(ScimTokenGuard.name);
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = String(request.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token.startsWith('fsit_scim_')) throw new UnauthorizedException('Invalid SCIM token');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await this.prisma.query<any[]>(
      `SELECT id, companyId FROM ScimProvisioningToken
       WHERE tokenHash = ? AND isActive = 1 AND revokedAt IS NULL
         AND (expiresAt IS NULL OR expiresAt > NOW(3)) LIMIT 1`,
      [tokenHash],
    );
    if (!rows[0]) throw new UnauthorizedException('Invalid or expired SCIM token');
    request.scim = rows[0];
    await this.prisma.execute(`UPDATE ScimProvisioningToken SET lastUsedAt = NOW(3) WHERE id = ?`, [rows[0].id]).catch((error) => {
      this.logger.warn(`Failed to update SCIM token usage for ${rows[0].id}: ${error?.message || error}`);
    });
    return true;
  }
}
