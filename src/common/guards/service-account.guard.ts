import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ServiceAccountGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAccountGuard.name);
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = String(request.headers['x-service-token'] || '').trim();
    if (!token.startsWith('fsit_sa_')) throw new UnauthorizedException('Service account token is required');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const rows = await this.prisma.query<any[]>(
      `SELECT * FROM ServiceAccount
       WHERE tokenHash = ? AND isActive = 1 AND revokedAt IS NULL
         AND (expiresAt IS NULL OR expiresAt > NOW(3))
       LIMIT 1`,
      [hash],
    );
    const account = rows[0];
    if (!account) throw new UnauthorizedException('Service account token is invalid');
    const permissions = this.parseJson(account.permissionSlugs, []);
    const scopeValues = this.parseJson(account.scopeValues, []);
    request.user = {
      id: account.id,
      email: `${account.name}@service-account.local`,
      role: 'SERVICE_ACCOUNT',
      userType: 'SERVICE_ACCOUNT',
      companyId: account.companyId,
      isActive: true,
      serviceAccount: true,
      permissionSlugs: permissions,
      permissionScopes: permissions.map((permissionSlug: string) => ({
        permissionSlug,
        scopeType: account.scopeType,
        scopeValues,
      })),
    };
    await this.prisma.execute(
      `UPDATE ServiceAccount SET lastUsedAt = NOW(3), lastUsedIp = ?, updatedAt = NOW(3) WHERE id = ?`,
      [String(request.ip || request.socket?.remoteAddress || '').slice(0, 191) || null, account.id],
    ).catch((error) => this.logger.warn(`Failed to update service-account usage for ${account.id}: ${error?.message || error}`));
    return true;
  }

  private parseJson(value: any, fallback: any) {
    try {
      return typeof value === 'string' ? JSON.parse(value) : value || fallback;
    } catch {
      return fallback;
    }
  }
}
