import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(user: any, query: string) {
    const permissions = await this.effectivePermissions(user);
    const scopes = await this.permissionScopes(user);
    const [tickets, assets] = await Promise.all([
      permissions.has('tickets.view') ? this.searchTickets(user, query, scopes) : [],
      permissions.has('assets.view') ? this.searchAssets(user, query, scopes) : [],
    ]);

    return { tickets, assets };
  }

  private async searchTickets(user: any, query: string, scopes: any[]) {
    const where: any = {
      deletedAt: null,
      OR: [
        { title: { contains: query } },
        { ticketNumber: { contains: query } },
        { description: { contains: query } },
      ],
    };

    if (user.userType === 'PUBLIC') {
      where.createdById = user.id;
    } else if (user.companyId) {
      where.companyId = user.companyId;
    }
    await this.applyTicketScopes(where, scopes, user);

    return this.prisma.ticket.findMany({
      where,
      take: 25,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        createdAt: true,
      },
    });
  }

  private async searchAssets(user: any, query: string, scopes: any[]) {
    if (!user.companyId && user.role !== 'SUPER_ADMIN') return [];

    const where: any = {
        ...(user.companyId ? { companyId: user.companyId } : {}),
        deletedAt: null,
        OR: [
          { name: { contains: query } },
          { serialNumber: { contains: query } },
          { ipAddress: { contains: query } },
          { model: { contains: query } },
          { location: { contains: query } },
        ],
      };
    const matching = scopes.filter((scope) => String(scope.permissionSlug || '').startsWith('assets.'));
    if (matching.length && !matching.some((scope) => scope.scopeType === 'ALL')) {
      const alternatives: any[] = [];
      if (matching.some((scope) => scope.scopeType === 'LOCATION') && user.location) alternatives.push({ location: user.location });
      const customers = matching.filter((scope) => scope.scopeType === 'CUSTOMERS').flatMap((scope) => this.parseValues(scope.scopeValues));
      if (customers.length) alternatives.push({ companyId: { in: customers } });
      where.AND = [alternatives.length ? { OR: alternatives } : { id: '__scope_denied__' }];
    }
    return this.prisma.asset.findMany({
      where,
      take: 25,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        assetType: true,
        serialNumber: true,
        status: true,
        location: true,
      },
    });
  }

  private async effectivePermissions(user: any) {
    if (user.role === 'SUPER_ADMIN') return new Set<string>(['tickets.view', 'assets.view']);
    const rows = await this.prisma.query<any[]>(
      `SELECT DISTINCT p.slug FROM Permission p
       JOIN RolePermission rp ON rp.permissionId = p.id
       JOIN Role r ON r.id = rp.roleId
       LEFT JOIN UserRole ur ON ur.roleId = r.id AND ur.userId = ?
       WHERE ur.userId IS NOT NULL OR (r.isSystem = 1 AND (r.name = ? OR r.slug = ?))
       UNION
       SELECT p.slug FROM TemporaryPermissionGrant tpg JOIN Permission p ON p.id = tpg.permissionId
       WHERE tpg.userId = ? AND tpg.revokedAt IS NULL AND tpg.startsAt <= NOW(3) AND tpg.expiresAt > NOW(3)`,
      [user.id, user.role, String(user.role || '').toLowerCase().replace(/_/g, '-'), user.id],
    ).catch(() => []);
    return new Set<string>(rows.map((row: any) => row.slug));
  }

  private async permissionScopes(user: any) {
    return this.prisma.query<any[]>(
      `SELECT ps.permissionSlug, ps.scopeType, ps.scopeValues FROM PermissionScope ps
       WHERE ps.userId = ? OR ps.roleId IN (SELECT roleId FROM UserRole WHERE userId = ?)`,
      [user.id, user.id],
    ).catch(() => []);
  }

  private async applyTicketScopes(where: any, scopes: any[], user: any) {
    const matching = scopes.filter((scope) => String(scope.permissionSlug || '').startsWith('tickets.'));
    if (!matching.length || matching.some((scope) => scope.scopeType === 'ALL')) return;
    const alternatives: any[] = [];
    if (matching.some((scope) => scope.scopeType === 'ASSIGNED')) alternatives.push({ assignedToId: user.id });
    if (matching.some((scope) => scope.scopeType === 'LOCATION') && user.location) alternatives.push({ location: user.location });
    const customers = matching.filter((scope) => scope.scopeType === 'CUSTOMERS').flatMap((scope) => this.parseValues(scope.scopeValues));
    if (customers.length) alternatives.push({ companyId: { in: customers } });
    if (matching.some((scope) => scope.scopeType === 'RELATIONSHIP')) {
      const relations = await this.prisma.query<any[]>(
        `SELECT resourceType, resourceId FROM AuthorizationRelationship
         WHERE subjectType = 'USER' AND subjectId = ? AND relationName IN ('viewer', 'editor', 'owner', 'technician')
           AND (expiresAt IS NULL OR expiresAt > NOW(3))`,
        [user.id],
      ).catch(() => []);
      const ticketIds = relations.filter((item: any) => item.resourceType === 'TICKET').map((item: any) => item.resourceId);
      const companyIds = relations.filter((item: any) => item.resourceType === 'COMPANY').map((item: any) => item.resourceId);
      if (ticketIds.length) alternatives.push({ id: { in: ticketIds } });
      if (companyIds.length) alternatives.push({ companyId: { in: companyIds } });
    }
    where.AND = [alternatives.length ? { OR: alternatives } : { id: '__scope_denied__' }];
  }

  private parseValues(value: any): string[] {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
}
