import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type SearchResult = {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  href: string;
  meta?: string | null;
  createdAt?: Date | string | null;
};

const PAGE_INDEX = [
  { title: 'Dashboard', href: '/dashboard', terms: 'overview metrics home activity' },
  { title: 'Tickets', href: '/tickets', terms: 'incidents service requests support ticket number status priority' },
  { title: 'New Ticket', href: '/tickets/new', terms: 'create submit ticket request incident' },
  { title: 'My Tickets', href: '/my-tickets', terms: 'my requests support cases' },
  { title: 'Submit Ticket', href: '/submit-ticket', terms: 'create public request help support' },
  { title: 'Service Catalog', href: '/catalog-requests', terms: 'catalog access vpn mfa software hardware request' },
  { title: 'Assets', href: '/assets', terms: 'devices cmdb inventory serial ip imei user' },
  { title: 'Inventory', href: '/inventory', terms: 'parts stock locations low stock supplies' },
  { title: 'Network', href: '/network', terms: 'devices syslog monitoring wifi snmp router switch firewall' },
  { title: 'Topology Map', href: '/topology', terms: 'network map devices links health' },
  { title: 'Knowledge Base', href: '/knowledge-base', terms: 'articles documentation kb help guides' },
  { title: 'Dispatch', href: '/dispatch', terms: 'field service schedule technician route appointment' },
  { title: 'Technician Mobile', href: '/technician-mobile', terms: 'mobile field updates work orders' },
  { title: 'Maintenance', href: '/maintenance', terms: 'plans preventive maintenance schedule assets' },
  { title: 'Reports', href: '/reports', terms: 'analytics charts exports insights' },
  { title: 'SLA Tracking', href: '/sla', terms: 'response resolution service level agreement' },
  { title: 'Quotes and Invoices', href: '/quotes-invoices', terms: 'billing quotes invoices payments' },
  { title: 'MFA and Sessions', href: '/profile/MFA', terms: 'mfa authenticator google authenticator two factor 2fa recovery codes device sessions' },
  { title: 'Profile', href: '/profile', terms: 'account user mfa password notifications sessions authenticator' },
  { title: 'Settings', href: '/settings', terms: 'company branding timezone locale customization' },
  { title: 'Security Center', href: '/security-center', terms: 'compliance findings events posture access review' },
  { title: 'Access Requests', href: '/access-requests', terms: 'permissions approvals access' },
  { title: 'Users', href: '/admin/users', terms: 'admin people accounts roles active inactive' },
  { title: 'Company Users', href: '/admin/company', terms: 'tenant admin people users accounts roles active inactive' },
  { title: 'Companies', href: '/admin/companies', terms: 'admin tenants customers organizations' },
  { title: 'Security Operations', href: '/admin/security-operations', terms: 'mfa policy sessions sso backup retention security' },
  { title: 'Email Operations', href: '/admin/email-operations', terms: 'smtp email delivery webhook notifications' },
  { title: 'Permissions', href: '/admin/permissions', terms: 'roles access governance policies' },
  { title: 'Audit Logs', href: '/admin/audit-logs', terms: 'audit history changes events' },
];

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(user: any, query: string) {
    const permissions = await this.effectivePermissions(user);
    const scopes = await this.permissionScopes(user);
    const [pages, tickets, assets, users, companies, articles, catalogItems, catalogRequests] = await Promise.all([
      this.searchPages(query, permissions, user),
      permissions.has('tickets.view') ? this.searchTickets(user, query, scopes) : [],
      permissions.has('assets.view') ? this.searchAssets(user, query, scopes) : [],
      permissions.has('users.view') ? this.searchUsers(user, query) : [],
      user.role === 'SUPER_ADMIN' ? this.searchCompanies(query) : [],
      permissions.has('knowledge-base.view') ? this.searchKnowledgeArticles(user, query) : [],
      this.searchCatalogItems(user, query),
      this.searchCatalogRequests(user, query),
    ]);

    return { pages, tickets, assets, users, companies, articles, catalogItems, catalogRequests };
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

    const companyId = this.companyId(user);
    if (user.userType === 'PUBLIC') {
      where.createdById = user.id;
    } else if (companyId) {
      where.companyId = companyId;
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
    const companyId = this.companyId(user);
    if (!companyId && user.role !== 'SUPER_ADMIN') return [];

    const where: any = {
        ...(companyId ? { companyId } : {}),
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
        ipAddress: true,
      },
    });
  }

  private async effectivePermissions(user: any) {
    if (user.role === 'SUPER_ADMIN') {
      return new Set<string>(['tickets.view', 'assets.view', 'users.view', 'knowledge-base.view']);
    }
    if (Array.isArray(user.permissionSlugs) && user.permissionSlugs.length) {
      return new Set<string>(user.permissionSlugs);
    }
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
    if (Array.isArray(user.permissionScopes)) return user.permissionScopes;
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

  private companyId(user: any) {
    return user.effectiveCompanyId || user.companyId || null;
  }

  private searchPages(query: string, permissions: Set<string>, user: any): SearchResult[] {
    const normalized = query.toLowerCase();
    return PAGE_INDEX.filter((page) => {
      if (page.href.startsWith('/admin') && user.role !== 'SUPER_ADMIN' && user.role !== 'TENANT_ADMIN') return false;
      if (page.href === '/admin/users' && user.role !== 'SUPER_ADMIN') return false;
      if (page.href === '/admin/company' && !permissions.has('users.view')) return false;
      if (page.href === '/admin/companies' && user.role !== 'SUPER_ADMIN') return false;
      if (page.href === '/admin/permissions' && user.role !== 'SUPER_ADMIN' && user.role !== 'TENANT_ADMIN') return false;
      if (page.href === '/assets' && !permissions.has('assets.view')) return false;
      if (page.href === '/tickets' && !permissions.has('tickets.view')) return false;
      if (page.href === '/knowledge-base' && !permissions.has('knowledge-base.view')) return false;
      const haystack = `${page.title} ${page.href} ${page.terms}`.toLowerCase();
      return haystack.includes(normalized);
    }).slice(0, 12).map((page) => ({
      id: page.href,
      title: page.title,
      subtitle: 'Page',
      description: page.terms,
      href: page.href,
    }));
  }

  private async searchUsers(user: any, query: string): Promise<SearchResult[]> {
    const companyId = this.companyId(user);
    if (!companyId && user.role !== 'SUPER_ADMIN') return [];
    const where: any = {
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
      OR: [
        { email: { contains: query } },
        { firstName: { contains: query } },
        { lastName: { contains: query } },
        { phone: { contains: query } },
      ],
    };
    const rows = await this.prisma.user.findMany({
      where,
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userType: true,
        company: { select: { name: true } },
        isActive: true,
      },
    });
    return rows.map((item) => ({
      id: item.id,
      title: `${item.firstName} ${item.lastName}`.trim() || item.email,
      subtitle: item.email,
      description: `${item.role} ${item.userType}${item.company?.name ? ` at ${item.company.name}` : ''}`,
      meta: item.isActive ? 'Active' : 'Inactive',
      href: user.role === 'SUPER_ADMIN' ? `/admin/users?search=${encodeURIComponent(item.email)}` : `/admin/company?search=${encodeURIComponent(item.email)}`,
    }));
  }

  private async searchCompanies(query: string): Promise<SearchResult[]> {
    const rows = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
        OR: [
          { name: { contains: query } },
          { slug: { contains: query } },
          { domain: { contains: query } },
        ],
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, slug: true, domain: true, isActive: true },
    });
    return rows.map((item) => ({
      id: item.id,
      title: item.name,
      subtitle: item.domain || item.slug,
      description: 'Company',
      meta: item.isActive ? 'Active' : 'Inactive',
      href: `/admin/companies?search=${encodeURIComponent(item.name)}`,
    }));
  }

  private async searchKnowledgeArticles(user: any, query: string): Promise<SearchResult[]> {
    const companyId = this.companyId(user);
    if (!companyId && user.role !== 'SUPER_ADMIN') return [];
    const term = `%${query}%`;
    const values: any[] = [term, term, term, term];
    let where = `(title LIKE ? OR content LIKE ? OR category LIKE ? OR tags LIKE ?)`;
    if (companyId) {
      where = `companyId = ? AND ${where}`;
      values.unshift(companyId);
    }
    const rows = await this.prisma.query<any[]>(
      `SELECT id, title, category, tags, updatedAt
       FROM KbArticle
       WHERE ${where}
       ORDER BY updatedAt DESC
       LIMIT 20`,
      values,
    ).catch(() => []);
    return rows.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.category || 'Knowledge base',
      description: item.tags,
      href: `/knowledge-base?article=${encodeURIComponent(item.id)}`,
      createdAt: item.updatedAt,
    }));
  }

  private async searchCatalogItems(user: any, query: string): Promise<SearchResult[]> {
    const companyId = this.companyId(user);
    const term = `%${query}%`;
    const rows = await this.prisma.query<any[]>(
      `SELECT id, name, shortDescription, category, requestType
       FROM CatalogItem
       WHERE isActive = 1
         AND (companyId IS NULL ${companyId ? 'OR companyId = ?' : ''})
         AND (name LIKE ? OR shortDescription LIKE ? OR description LIKE ? OR category LIKE ? OR requestType LIKE ?)
       ORDER BY sortOrder ASC, name ASC
       LIMIT 20`,
      companyId ? [companyId, term, term, term, term, term] : [term, term, term, term, term],
    ).catch(() => []);
    return rows.map((item) => ({
      id: item.id,
      title: item.name,
      subtitle: `${item.requestType} catalog item`,
      description: item.shortDescription || item.category,
      href: `/catalog-requests/new?catalogItemId=${encodeURIComponent(item.id)}`,
    }));
  }

  private async searchCatalogRequests(user: any, query: string): Promise<SearchResult[]> {
    const companyId = this.companyId(user);
    const where: any = {
      OR: [
        { title: { contains: query } },
        { description: { contains: query } },
        { itemName: { contains: query } },
        { justification: { contains: query } },
        { status: { contains: query } },
      ],
    };
    if (user.userType === 'PUBLIC') {
      where.createdById = user.id;
    } else if (companyId) {
      where.companyId = companyId;
    } else if (user.role !== 'SUPER_ADMIN') {
      return [];
    }
    const values: any[] = [];
    const clauses = [
      `(title LIKE ? OR description LIKE ? OR itemName LIKE ? OR justification LIKE ? OR status LIKE ?)`,
    ];
    const term = `%${query}%`;
    values.push(term, term, term, term, term);
    if (where.createdById) {
      clauses.push('createdById = ?');
      values.push(where.createdById);
    } else if (where.companyId) {
      clauses.push('companyId = ?');
      values.push(where.companyId);
    }
    const rows = await this.prisma.query<any[]>(
      `SELECT id, title, itemName, status, requestType, createdAt
       FROM CatalogRequest
       WHERE ${clauses.join(' AND ')}
       ORDER BY createdAt DESC
       LIMIT 20`,
      values,
    ).catch(() => []);
    return rows.map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.itemName || item.requestType,
      description: 'Catalog request',
      meta: item.status,
      href: `/catalog-requests/${item.id}`,
      createdAt: item.createdAt,
    }));
  }
}
