import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../../database/prisma.service';
import { AuthorizationRepository } from '../../database/repositories/authorization.repository';

/**
 * PermissionsGuard - Enforces role-based and attribute-based access control (RBAC/ABAC)
 *
 * This guard validates that the authenticated user has the required permissions to access an endpoint.
 * It supports multiple permission sources:
 * 1. Super admin bypass (automatic grant)
 * 2. Service account permissions (direct slug check)
 * 3. User role-based permissions (via UserRole/Role/RolePermission tables)
 * 4. Temporary permission grants (TemporaryPermissionGrant with time-based expiry)
 * 5. Permission scopes (fine-grained, company/role/user-level access constraints)
 * 6. Contextual access policies (IP, country, MFA, time-of-day restrictions)
 *
 * CRITICAL FIX (June 10, 2026): Line 60 now uses `rp.slug` instead of `rp.permission.slug`
 * because the DB query flattens the result via JOIN. This was causing 500 errors for tenant admins.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private authorizationRepository: AuthorizationRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Extract required permissions from the @Permissions() decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permissions required — allow access
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Fast path: Super admins bypass all permission checks
    if (user.role === 'SUPER_ADMIN') {
      user.superAdminOverride = true;
      this.recordUsage(user, requiredPermissions, request).catch(() => {});
      return true;
    }

    // Service account fast path: Check direct permission slugs
    if (user.serviceAccount) {
      const servicePermissions = new Set<string>(user.permissionSlugs || []);
      request.permissionScopes = user.permissionScopes || [];
      const hasAll = requiredPermissions.every((permission) => servicePermissions.has(permission));
      if (!hasAll) throw new ForbiddenException('Insufficient permissions');
      this.recordUsage(user, requiredPermissions, request).catch(() => {});
      return true;
    }

    // Regular user: Load roles and their permissions
    const userPermissionSlugs = new Set<string>();
    const assignedPermissions = await this.authorizationRepository.findUserRolePermissions(user.id);
    const effectiveRoleIds = [...new Set(assignedPermissions.map((permission) => permission.roleId))];
    for (const permission of assignedPermissions) {
      userPermissionSlugs.add(permission.slug);
    }

    // Load system role permissions (e.g., "TENANT_ADMIN" role gets specific default permissions)
    const primaryRolePermissions = await this.authorizationRepository.findSystemRolePermissions(user.role).catch(() => []);
    for (const permission of primaryRolePermissions) {
      userPermissionSlugs.add(permission.slug);
      if (!effectiveRoleIds.includes(permission.roleId)) effectiveRoleIds.push(permission.roleId);
    }

    // Load temporary permission grants (time-bound, may grant elevated access)
    const temporaryGrants = await this.prisma.query<any[]>(
      `SELECT p.slug, tpg.scopeType, tpg.scopeValue
       FROM TemporaryPermissionGrant tpg
       JOIN Permission p ON p.id = tpg.permissionId
       WHERE tpg.userId = ?
         AND tpg.revokedAt IS NULL
         AND tpg.startsAt <= NOW(3)
         AND tpg.expiresAt > NOW(3)`,
      [user.id],
    ).catch(() => []);
    for (const grant of temporaryGrants) userPermissionSlugs.add(grant.slug);

    // Load permission scopes (CRITICAL): Defines fine-grained access boundaries
    // Scopes constrain access to specific companies, assets, tickets, etc.
    // This is stored on the request for downstream use in query builders
    request.permissionScopes = await this.prisma.query<any[]>(
      `SELECT permissionSlug, scopeType, scopeValues, roleId, userId
       FROM PermissionScope
       WHERE (userId = ? OR roleId IN (${effectiveRoleIds.length ? effectiveRoleIds.map(() => '?').join(',') : "''"}))
         AND (companyId IS NULL OR companyId = ?)`,
      [user.id, ...effectiveRoleIds, user.companyId || null],
    ).catch(() => []);
    user.permissionScopes = request.permissionScopes;
    user.permissionSlugs = [...userPermissionSlugs];

    // Check if user has all required permissions
    const hasAll = requiredPermissions.every((p) => userPermissionSlugs.has(p));
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }

    // Apply contextual access policies (IP whitelisting, MFA requirement, time-of-day restrictions, etc.)
    await this.enforceContextualPolicies(user, requiredPermissions, request);
    this.recordUsage(user, requiredPermissions, request).catch(() => {});
    return true;
  }

  /**
   * Enforces contextual access policies (e.g., IP, country, MFA, time-of-day restrictions)
   * These policies can DENY access even if the user has the required permission slug.
   */
  private async enforceContextualPolicies(user: any, permissions: string[], request: any) {
    if (!permissions.length) return;
    const placeholders = permissions.map(() => '?').join(',');
    const policies = await this.prisma.query<any[]>(
      `SELECT * FROM ContextualAccessPolicy
       WHERE isActive = 1
         AND targetType = 'PERMISSION'
         AND targetValue IN (${placeholders})
         AND (companyId IS NULL OR companyId = ?)`,
      [...permissions, user.companyId || null],
    ).catch(() => []);

    for (const policy of policies) {
      const conditions = this.parseConditions(policy.conditions);
      const matches = this.contextMatches(conditions, user, request);
      const denied = String(policy.effect).toUpperCase() === 'DENY' ? matches : !matches;
      if (denied) {
        throw new ForbiddenException(`Access blocked by contextual policy: ${policy.name}`);
      }
    }
  }

  /**
   * Evaluates contextual conditions against the current request context
   * Supports: IP CIDR ranges, country codes, MFA, device trust, time-of-day restrictions
   */
  private contextMatches(conditions: any, user: any, request: any) {
    const ip = String(request.ip || request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const country = String(request.headers?.['x-country-code'] || request.headers?.['cf-ipcountry'] || '').toUpperCase();
    const assurance = String(request.headers?.['x-auth-assurance'] || '').toLowerCase();
    const deviceTrust = String(request.headers?.['x-device-trust'] || '').toLowerCase();
    const hour = new Date().getUTCHours();

    if (Array.isArray(conditions.ipAddresses) && !conditions.ipAddresses.some((value: string) => this.ipMatches(ip, value))) return false;
    if (Array.isArray(conditions.countries) && !conditions.countries.map((value: string) => value.toUpperCase()).includes(country)) return false;
    if (conditions.department && String(user.department || '').toLowerCase() !== String(conditions.department).toLowerCase()) return false;
    if (conditions.location && String(user.location || '').toLowerCase() !== String(conditions.location).toLowerCase()) return false;
    if (conditions.trustedDevice === true && deviceTrust !== 'trusted') return false;
    if (conditions.requireMfa === true && !['mfa', 'phishing-resistant'].includes(assurance)) return false;
    if (conditions.requirePhishingResistant === true && assurance !== 'phishing-resistant') return false;
    if (conditions.utcHours) {
      const start = Number(conditions.utcHours.start);
      const end = Number(conditions.utcHours.end);
      if (Number.isFinite(start) && Number.isFinite(end) && (hour < start || hour >= end)) return false;
    }
    return true;
  }

  /**
   * CIDR matching: Supports both exact IPs (e.g., "192.168.1.1") and CIDR ranges (e.g., "192.168.1.0/24")
   */
  private ipMatches(ip: string, rule: string) {
    if (!rule.includes('/')) return ip === rule;
    const [network, prefixText] = rule.split('/');
    const prefix = Number(prefixText);
    if (prefix < 0 || prefix > 32) return false;
    const toNumber = (value: string) => value.split('.').reduce((result, octet) => (result << 8) + Number(octet), 0) >>> 0;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (toNumber(ip) & mask) === (toNumber(network) & mask);
  }

  /**
   * Safely parse conditions object (supports JSON string or object)
   */
  private parseConditions(value: any) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return {}; }
  }

  /**
   * Records permission usage for audit trails and analytics
   */
  private async recordUsage(user: any, permissions: string[], request: any) {
    const principalType = user.serviceAccount ? 'SERVICE_ACCOUNT' : 'USER';
    const principalId = user.id;
    if (!principalId) return;
    for (const permissionSlug of permissions) {
      await this.prisma.execute(
        `INSERT INTO PermissionUsage
         (id, companyId, principalType, principalId, permissionSlug, resourceType, resourceId, usedAt)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          user.companyId || null,
          principalType,
          principalId,
          permissionSlug,
          String(request.route?.path || request.path || '').slice(0, 64) || null,
          request.params?.id || null,
        ],
      );
    }
  }
}
