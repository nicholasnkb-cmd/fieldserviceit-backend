/**
 * Database Query Builder Utilities
 * 
 * Provides reusable functions for building complex database queries,
 * particularly for permission scope filtering.
 */

/**
 * Build a company scope AND condition
 * 
 * Used for multi-tenant queries where you need to filter by:
 * 1. Company ID (tenant isolation)
 * 2. Additional status/state conditions
 * 
 * Example Usage:
 * ```typescript
 * const scope = buildCompanyScope(
 *   'company-123',
 *   { status: { in: ['ACTIVE', 'PENDING'] }, complianceStatus: 'COMPLIANT' }
 * );
 * // Result:
 * // {
 * //   AND: [
 * //     { companyId: 'company-123' },
 * //     { status: { in: ['ACTIVE', 'PENDING'] } },
 * //     { complianceStatus: 'COMPLIANT' }
 * //   ]
 * // }
 * ```
 */
export function buildCompanyScope(
  companyId: string,
  additionalConditions?: Record<string, any>
): { AND: Record<string, any>[] } {
  const conditions: Record<string, any>[] = [{ companyId }];

  if (additionalConditions) {
    Object.entries(additionalConditions).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        conditions.push({ [key]: value });
      }
    });
  }

  return { AND: conditions };
}

/**
 * Build an asset query scope
 * 
 * Combines company ID with asset-specific filters:
 * - Asset type (e.g., LAPTOP, DESKTOP, PHONE)
 * - Status (ACTIVE, ARCHIVED, PENDING)
 * - Enrollment status for MDM
 * 
 * Example Usage:
 * ```typescript
 * const scope = buildAssetScope('company-123', {
 *   assetType: 'LAPTOP',
 *   status: { in: ['ACTIVE', 'PENDING'] },
 *   enrollmentStatus: 'ENROLLED'
 * });
 * ```
 */
export function buildAssetScope(
  companyId: string,
  filters: AssetFilters
): { AND: Record<string, any>[] } {
  const conditions: Record<string, any>[] = [{ companyId }];

  if (filters.assetType) {
    conditions.push({ assetType: filters.assetType });
  }
  if (filters.status) {
    conditions.push({ status: filters.status });
  }
  if (filters.enrollmentStatus) {
    conditions.push({ enrollmentStatus: filters.enrollmentStatus });
  }
  if (filters.complianceStatus) {
    conditions.push({ complianceStatus: filters.complianceStatus });
  }
  if (filters.assignedUser) {
    conditions.push({ assignedUser: filters.assignedUser });
  }
  if (filters.serialNumber) {
    conditions.push({ serialNumber: { contains: filters.serialNumber } });
  }

  return { AND: conditions };
}

/**
 * Build a ticket query scope
 * 
 * Combines company ID with ticket-specific filters:
 * - Ticket status (OPEN, IN_PROGRESS, CLOSED)
 * - Priority (LOW, MEDIUM, HIGH, URGENT)
 * - Assignment status (assigned, unassigned)
 */
export function buildTicketScope(
  companyId: string,
  filters: TicketFilters
): { AND: Record<string, any>[] } {
  const conditions: Record<string, any>[] = [{ companyId }];

  if (filters.status) {
    conditions.push({ status: filters.status });
  }
  if (filters.priority) {
    conditions.push({ priority: filters.priority });
  }
  if (filters.assignedToId) {
    conditions.push({ assignedToId: filters.assignedToId });
  }
  if (filters.type) {
    conditions.push({ type: filters.type });
  }
  if (filters.createdById) {
    conditions.push({ createdById: filters.createdById });
  }

  return { AND: conditions };
}

/**
 * Build a permission scope query
 * 
 * Filters permissions by:
 * - User or Role
 * - Company
 * - Specific permission slugs
 */
export function buildPermissionScope(
  filters: PermissionFilters
): Record<string, any> {
  const conditions: Record<string, any>[] = [];

  if (filters.userId) {
    conditions.push({ userId: filters.userId });
  }
  if (filters.roleId) {
    conditions.push({ roleId: filters.roleId });
  }
  if (filters.companyId) {
    conditions.push({ companyId: filters.companyId });
  }
  if (filters.permissionSlug) {
    conditions.push({ permissionSlug: filters.permissionSlug });
  }

  if (conditions.length === 0) {
    return {};
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return { AND: conditions };
}

/**
 * Merge multiple AND conditions
 * 
 * Useful when combining different scope conditions
 * 
 * Example:
 * ```typescript
 * const companyScope = buildCompanyScope('company-123');
 * const statusScope = { status: 'ACTIVE' };
 * const merged = mergeScopes([companyScope, statusScope]);
 * // Result: { AND: [{ companyId: 'company-123' }, { status: 'ACTIVE' }] }
 * ```
 */
export function mergeScopes(scopes: Record<string, any>[]): Record<string, any> {
  const allConditions: Record<string, any>[] = [];

  scopes.forEach((scope) => {
    if (scope.AND && Array.isArray(scope.AND)) {
      allConditions.push(...scope.AND);
    } else if (Object.keys(scope).length > 0) {
      allConditions.push(scope);
    }
  });

  if (allConditions.length === 0) {
    return {};
  }
  if (allConditions.length === 1) {
    return allConditions[0];
  }
  return { AND: allConditions };
}

/**
 * Type definitions for filter parameters
 */
export interface AssetFilters {
  assetType?: string;
  status?: { in: string[] } | string;
  enrollmentStatus?: string;
  complianceStatus?: string;
  assignedUser?: string;
  serialNumber?: string;
}

export interface TicketFilters {
  status?: { in: string[] } | string;
  priority?: string;
  assignedToId?: string;
  type?: string;
  createdById?: string;
}

export interface PermissionFilters {
  userId?: string;
  roleId?: string;
  companyId?: string;
  permissionSlug?: string;
}

/**
 * Usage Examples:
 * 
 * // Get all active laptops for a company
 * const laptopScope = buildAssetScope('company-123', {
 *   assetType: 'LAPTOP',
 *   status: 'ACTIVE'
 * });
 * const assets = await prisma.asset.findMany({ where: laptopScope });
 * 
 * // Get open tickets for a technician
 * const technicianTickets = buildTicketScope('company-123', {
 *   assignedToId: 'user-456',
 *   status: 'OPEN'
 * });
 * const tickets = await prisma.ticket.findMany({ where: technicianTickets });
 * 
 * // Get user's permissions across all companies
 * const userPermissions = buildPermissionScope({
 *   userId: 'user-789',
 *   permissionSlug: 'asset:read'
 * });
 * const perms = await prisma.permissionScope.findMany({
 *   where: userPermissions
 * });
 */
