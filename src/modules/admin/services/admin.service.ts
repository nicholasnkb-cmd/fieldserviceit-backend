import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AccessGovernanceService } from './access-governance.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CurrentUser } from '../../../common/types';
import { CRITICAL_PERMISSION_SLUGS, PERMISSION_DEPENDENCIES, PERMISSION_PRESETS, PERMISSION_RISK_RULES, PERMISSION_SCOPE_TYPES } from '../permissions.config';
import { assertTenantRoleChange, tenantAssignableRoles } from './tenant-role-governance';

const BCRYPT_ROUNDS = 12;
const VALID_ROLES = ['SUPER_ADMIN', 'GLOBAL_TECH', 'TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY'];
const GLOBAL_ROLES = ['SUPER_ADMIN', 'GLOBAL_TECH'];
const FEATURE_KEYS = ['tickets', 'dispatch', 'assets', 'network', 'rmmIntegration', 'aiAgent', 'reporting', 'workflows', 'billing', 'settings', 'auditLogs', 'catalogRequests'];

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
    private accessGovernance: AccessGovernanceService,
  ) {}

  private normalizeRole(role: any) {
    if (!role) return role;
    const permissions = Array.isArray(role.permissions) ? role.permissions : [];
    return {
      ...role,
      permissions: permissions.map((entry: any) => {
        if (entry.permission) return entry;
        return {
          roleId: entry.roleId ?? role.id,
          permissionId: entry.permissionId ?? entry.id,
          createdAt: entry.createdAt,
          permission: {
            id: entry.permissionId ?? entry.id,
            name: entry.name,
            slug: entry.slug,
            group: entry.group,
            description: entry.description,
          },
        };
      }),
      _count: role._count || { userRoles: Number(role.userRoleCount || 0) },
    };
  }

  private async findPermissionsBySlugs(slugs: string[]) {
    const uniqueSlugs = [...new Set(slugs.filter(Boolean))];
    if (uniqueSlugs.length === 0) return [];

    const placeholders = uniqueSlugs.map(() => '?').join(', ');
    let permissions: any[];
    try {
      permissions = await this.prisma.query<any[]>(
        `SELECT id, name, slug, grp as \`group\`, description FROM Permission WHERE slug IN (${placeholders})`,
        uniqueSlugs,
      );
    } catch (err: any) {
      if (!String(err?.message || '').includes("Unknown column 'grp'")) throw err;
      permissions = await this.prisma.query<any[]>(
        `SELECT id, name, slug, \`group\`, description FROM Permission WHERE slug IN (${placeholders})`,
        uniqueSlugs,
      );
    }

    const found = new Set(permissions.map((permission) => permission.slug));
    const missing = uniqueSlugs.filter((slug) => !found.has(slug));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown permission(s): ${missing.join(', ')}`);
    }

    return permissions;
  }

  // ── Permissions ──

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { name: 'asc' }] });
  }

  // ── System Controls / Plan restrictions ──

  async listPlans() {
    return this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async updatePlan(id: string, dto: {
    description?: string;
    monthlyPrice?: number;
    annualPrice?: number;
    seatMonthlyPrice?: number;
    seatAnnualPrice?: number;
    trialDays?: number;
    maxUsers?: number;
    maxTickets?: number;
    isActive?: boolean;
    features?: Record<string, boolean>;
  }) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    const data: any = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.monthlyPrice !== undefined) data.monthlyPrice = Number(dto.monthlyPrice);
    if (dto.annualPrice !== undefined) data.annualPrice = Number(dto.annualPrice);
    if (dto.seatMonthlyPrice !== undefined) data.seatMonthlyPrice = Number(dto.seatMonthlyPrice);
    if (dto.seatAnnualPrice !== undefined) data.seatAnnualPrice = Number(dto.seatAnnualPrice);
    if (dto.trialDays !== undefined) data.trialDays = Math.max(0, Number(dto.trialDays));
    if (dto.maxUsers !== undefined) data.maxUsers = Number(dto.maxUsers);
    if (dto.maxTickets !== undefined) data.maxTickets = Number(dto.maxTickets);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.features !== undefined) data.features = JSON.stringify(dto.features);

    return this.prisma.plan.update({ where: { id }, data });
  }

  // ── System Roles (all companies) ──

  async listRoles(companyId?: string) {
    const values: any[] = [];
    const where = companyId ? 'WHERE r.companyId = ? OR r.isSystem = 1' : '';
    if (companyId) values.push(companyId);
    const roles = await this.prisma.query<any[]>(
      `SELECT r.*, (SELECT COUNT(*) FROM UserRole ur WHERE ur.roleId = r.id) as userRoleCount
       FROM Role r ${where} ORDER BY r.name ASC`,
      values,
    );
    for (const role of roles) {
      const permissions = await this.prisma.query<any[]>(
        `SELECT rp.roleId, rp.permissionId, p.id, p.name, p.slug, p.grp as \`group\`, p.description
         FROM RolePermission rp JOIN Permission p ON p.id = rp.permissionId WHERE rp.roleId = ?`,
        [role.id],
      );
      role.permissions = permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.permissionId,
        permission,
      }));
    }
    return roles.map((role: any) => this.normalizeRole(role));
  }

  async getRole(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { userRoles: true } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return this.normalizeRole(role);
  }

  async getPermissionWorkspace(actor: CurrentUser) {
    const companyId = actor.role === 'SUPER_ADMIN'
      ? undefined
      : actor.effectiveCompanyId || actor.companyId || undefined;
    if (actor.role !== 'SUPER_ADMIN' && !companyId) {
      throw new ForbiddenException('Select a company context to view permissions');
    }
    const [permissions, roles] = await Promise.all([this.listPermissions(), this.listRoles(companyId)]);
    const roleIds = roles.map((role: any) => role.id);
    const affectedUsers = roleIds.length ? await this.prisma.query<any[]>(
      `SELECT ur.roleId, u.id, u.firstName, u.lastName, u.email, u.isActive
       FROM UserRole ur JOIN User u ON u.id = ur.userId
       WHERE ur.roleId IN (${roleIds.map(() => '?').join(',')}) AND u.deletedAt IS NULL
       ORDER BY u.firstName, u.lastName`,
      roleIds,
    ) : [];
    const historyValues: any[] = [];
    let historyWhere = `a.resourceType = 'ROLE_PERMISSIONS'`;
    if (companyId) {
      historyWhere += ' AND a.companyId = ?';
      historyValues.push(companyId);
    }
    const history = await this.prisma.query<any[]>(
      `SELECT a.id, a.action, a.resourceId as roleId, a.diff, a.createdAt,
              u.id as actorId, u.firstName, u.lastName, u.email
       FROM AuditLog a LEFT JOIN User u ON u.id = a.actorId
       WHERE ${historyWhere} ORDER BY a.createdAt DESC LIMIT 100`,
      historyValues,
    );
    const usersByRole = affectedUsers.reduce((map: Record<string, any[]>, user: any) => {
      (map[user.roleId] ||= []).push({
        id: user.id, firstName: user.firstName, lastName: user.lastName,
        email: user.email, isActive: Boolean(user.isActive),
      });
      return map;
    }, {});
    const availableSlugs = new Set(permissions.map((permission: any) => permission.slug));
    return {
      scope: actor.role === 'SUPER_ADMIN' ? 'PLATFORM' : 'TENANT',
      permissions,
      roles: roles.map((role: any) => ({
        ...role,
        editable: actor.role === 'SUPER_ADMIN' || (!role.isSystem && role.companyId === actor.companyId),
        affectedUsers: usersByRole[role.id] || [],
      })),
      presets: PERMISSION_PRESETS.map((preset) => ({
        ...preset,
        permissionSlugs: preset.permissionSlugs.filter((slug) => availableSlugs.has(slug)),
      })),
      riskRules: PERMISSION_RISK_RULES,
      dependencies: PERMISSION_DEPENDENCIES,
      scopeTypes: PERMISSION_SCOPE_TYPES,
      criticalPermissionSlugs: CRITICAL_PERMISSION_SLUGS,
      history: history.map((entry: any) => ({
        ...entry,
        actor: entry.actorId ? { id: entry.actorId, firstName: entry.firstName, lastName: entry.lastName, email: entry.email } : null,
        diff: this.parseJson(entry.diff),
      })),
    };
  }

  async analyzePermissionChange(roleId: string, permissionSlugs: string[], actor: CurrentUser) {
    const role = await this.assertRoleScope(roleId, actor, true);
    const current = await this.getRole(roleId);
    const before = new Set<string>((current.permissions || []).map((entry: any) => String(entry.permission.slug)));
    const after = new Set<string>(permissionSlugs);
    const removed = [...before].filter((slug) => !after.has(slug));
    const criticalRemoved = removed.filter((slug) => CRITICAL_PERMISSION_SLUGS.includes(slug));
    const rows = await this.prisma.query<any[]>(
      `SELECT u.id, u.firstName, u.lastName, u.email
       FROM UserRole ur JOIN User u ON u.id = ur.userId
       WHERE ur.roleId = ? AND u.isActive = 1 AND u.deletedAt IS NULL
       ORDER BY u.firstName, u.lastName`,
      [roleId],
    );
    return {
      role: { id: role.id, name: role.name },
      removed,
      criticalRemoved,
      affectedUsers: rows,
      requiresAcknowledgement: criticalRemoved.length > 0 && rows.length > 0,
      risks: this.detectPermissionRisks(permissionSlugs),
      missingDependencies: this.detectMissingDependencies(permissionSlugs),
    };
  }

  async cloneRole(roleId: string, dto: { name: string; slug: string; description?: string }, actor: CurrentUser) {
    const source = await this.assertRoleScope(roleId, actor, false);
    const fullRole = await this.getRole(roleId);
    const targetCompanyId = actor.role === 'SUPER_ADMIN' ? (source.companyId || actor.companyId) : actor.companyId;
    const created = await this.createRole({
      ...dto,
      companyId: targetCompanyId || undefined,
      permissionSlugs: (fullRole.permissions || []).map((entry: any) => entry.permission.slug),
    });
    await this.recordPermissionAudit(actor, created.id, 'ROLE_CLONED', {
      sourceRoleId: roleId,
      before: [],
      after: (created.permissions || []).map((entry: any) => entry.permission.slug),
    }, targetCompanyId);
    return created;
  }

  async getEffectivePermissions(userId: string, actor: CurrentUser) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    if (actor.role !== 'SUPER_ADMIN' && user.companyId !== actor.companyId) {
      throw new ForbiddenException('User is outside your tenant');
    }
    const assignments = await this.getUserRoles(userId);
    const permissionMap = new Map<string, { permission: any; roles: string[] }>();
    if (user.role === 'SUPER_ADMIN') {
      const permissions = await this.listPermissions();
      permissions.forEach((permission: any) => permissionMap.set(permission.slug, {
        permission,
        roles: ['SUPER_ADMIN override'],
      }));
    }
    assignments.forEach((assignment: any) => {
      (assignment.role?.permissions || []).forEach((entry: any) => {
        const permission = entry.permission || entry;
        const current = permissionMap.get(permission.slug) || { permission, roles: [] };
        current.roles.push(assignment.role.name);
        permissionMap.set(permission.slug, current);
      });
    });
    const temporaryGrants = await this.prisma.query<any[]>(
      `SELECT tpg.id, tpg.expiresAt, tpg.scopeType, tpg.scopeValue,
              p.id as permissionId, p.name, p.slug, p.grp as \`group\`, p.description
       FROM TemporaryPermissionGrant tpg JOIN Permission p ON p.id = tpg.permissionId
       WHERE tpg.userId = ? AND tpg.revokedAt IS NULL
         AND tpg.startsAt <= NOW(3) AND tpg.expiresAt > NOW(3)
       ORDER BY tpg.expiresAt`,
      [userId],
    ).catch(() => []);
    temporaryGrants.forEach((grant: any) => {
      const current = permissionMap.get(grant.slug) || {
        permission: {
          id: grant.permissionId,
          name: grant.name,
          slug: grant.slug,
          group: grant.group,
          description: grant.description,
        },
        roles: [],
      };
      current.roles.push(`Temporary until ${new Date(grant.expiresAt).toISOString()}`);
      permissionMap.set(grant.slug, current);
    });
    const scopes = await this.prisma.query<any[]>(
      `SELECT ps.* FROM PermissionScope ps
       WHERE ps.userId = ? OR ps.roleId IN (
         SELECT roleId FROM UserRole WHERE userId = ?
       ) ORDER BY ps.permissionSlug, ps.scopeType`,
      [userId, userId],
    ).catch(() => []);
    return {
      user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email, companyId: user.companyId, role: user.role },
      supersededBySuperAdmin: user.role === 'SUPER_ADMIN',
      roles: assignments.map((assignment: any) => ({ id: assignment.role.id, name: assignment.role.name })),
      permissions: [...permissionMap.values()].sort((a, b) => a.permission.slug.localeCompare(b.permission.slug)),
      temporaryGrants: temporaryGrants.map((grant: any) => ({ ...grant, scopeValue: this.parseJson(grant.scopeValue) })),
      scopes: scopes.map((scope: any) => ({ ...scope, scopeValues: this.parseJson(scope.scopeValues) })),
    };
  }

  async getPermissionGovernance(actor: CurrentUser) {
    const companyId = actor.role === 'SUPER_ADMIN' ? null : actor.companyId;
    const values = companyId ? [companyId] : [];
    const [approvals, temporaryGrants, scopes, reviews, users] = await Promise.all([
      this.prisma.query<any[]>(
        `SELECT pa.*, r.name as roleName,
                rq.firstName as requesterFirstName, rq.lastName as requesterLastName,
                ap.firstName as approverFirstName, ap.lastName as approverLastName
         FROM PermissionApproval pa
         JOIN Role r ON r.id = pa.roleId
         JOIN User rq ON rq.id = pa.requestedById
         LEFT JOIN User ap ON ap.id = pa.approvedById
         ${companyId ? 'WHERE pa.companyId = ?' : ''}
         ORDER BY pa.createdAt DESC LIMIT 100`,
        values,
      ).catch(() => []),
      this.prisma.query<any[]>(
        `SELECT tpg.*, p.name as permissionName, p.slug as permissionSlug,
                u.firstName, u.lastName, u.email
         FROM TemporaryPermissionGrant tpg
         JOIN Permission p ON p.id = tpg.permissionId
         JOIN User u ON u.id = tpg.userId
         ${companyId ? 'WHERE tpg.companyId = ?' : ''}
         ORDER BY tpg.createdAt DESC LIMIT 100`,
        values,
      ).catch(() => []),
      this.prisma.query<any[]>(
        `SELECT ps.*, r.name as roleName, u.firstName, u.lastName, u.email
         FROM PermissionScope ps
         LEFT JOIN Role r ON r.id = ps.roleId
         LEFT JOIN User u ON u.id = ps.userId
         ${companyId ? 'WHERE ps.companyId = ?' : ''}
         ORDER BY ps.createdAt DESC LIMIT 100`,
        values,
      ).catch(() => []),
      this.prisma.query<any[]>(
        `SELECT arc.*,
                COUNT(ari.id) as itemCount,
                SUM(CASE WHEN ari.decision = 'PENDING' THEN 1 ELSE 0 END) as pendingCount
         FROM AccessReviewCampaign arc
         LEFT JOIN AccessReviewItem ari ON ari.campaignId = arc.id
         ${companyId ? 'WHERE arc.companyId = ?' : ''}
         GROUP BY arc.id ORDER BY arc.createdAt DESC LIMIT 50`,
        values,
      ).catch(() => []),
      this.prisma.query<any[]>(
        `SELECT id, firstName, lastName, email, role, isActive, lastLoginAt, companyId
         FROM User
         WHERE deletedAt IS NULL ${companyId ? 'AND companyId = ?' : ''}
         ORDER BY firstName, lastName`,
        companyId ? [companyId] : [],
      ),
    ]);
    return {
      approvals: approvals.map((item: any) => ({ ...item, requestedPermissions: this.parseJson(item.requestedPermissions) })),
      temporaryGrants: temporaryGrants.map((item: any) => ({ ...item, scopeValue: this.parseJson(item.scopeValue) })),
      scopes: scopes.map((item: any) => ({ ...item, scopeValues: this.parseJson(item.scopeValues) })),
      reviews,
      users,
      alerts: await this.getPermissionAlerts(actor),
      breakGlassAccounts: await this.listBreakGlassAccounts(actor),
      serviceAccounts: await this.listServiceAccounts(actor),
      authorizationCoverage: await this.getAuthorizationCoverage(),
      advanced: await this.accessGovernance.dashboard(actor),
      superAdminSupersedes: true,
    };
  }

  async listBreakGlassAccounts(actor: CurrentUser) {
    if (actor.role !== 'SUPER_ADMIN') return [];
    return this.prisma.query<any[]>(
      `SELECT id, firstName, lastName, email, isActive, mfaEnabled, lastLoginAt, breakGlassReason, createdAt
       FROM User WHERE role = 'SUPER_ADMIN' AND isBreakGlass = 1 AND deletedAt IS NULL
       ORDER BY lastLoginAt DESC`,
    ).catch(() => []);
  }

  async setBreakGlassAccount(userId: string, enabled: boolean, reason: string, actor: CurrentUser, approvalRequestId?: string) {
    if (actor.role !== 'SUPER_ADMIN') throw new ForbiddenException();
    if (enabled) await this.accessGovernance.assertApprovedAction(approvalRequestId || '', 'BREAK_GLASS_ACTIVATE', userId, actor);
    const user = await this.assertUserScope(userId, actor);
    if (user.role !== 'SUPER_ADMIN') throw new BadRequestException('Only super admins can be break-glass accounts');
    if (enabled && !user.mfaEnabled) throw new BadRequestException('Break-glass accounts must have MFA enabled');
    if (!enabled && user.isBreakGlass) await this.assertNotLastBreakGlassAccount(userId);
    await this.prisma.execute(
      `UPDATE User SET isBreakGlass = ?, breakGlassReason = ?, authVersion = authVersion + 1, updatedAt = NOW(3) WHERE id = ?`,
      [enabled ? 1 : 0, enabled ? String(reason || '').slice(0, 2000) : null, userId],
    );
    await this.revokeSessionsForUsers([userId], actor.id, 'break-glass-status-changed');
    await this.recordSecurityAlert(user.companyId, 'BREAK_GLASS_CHANGED', 'critical', userId, `${user.email} break-glass status changed`, { enabled, reason, actorId: actor.id });
    return { id: userId, isBreakGlass: enabled };
  }

  async listServiceAccounts(actor: CurrentUser) {
    const values = actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId];
    const rows = await this.prisma.query<any[]>(
      `SELECT id, companyId, name, permissionSlugs, scopeType, scopeValues, expiresAt,
              lastUsedAt, lastUsedIp, isActive, revokedAt, createdAt
       FROM ServiceAccount ${actor.role === 'SUPER_ADMIN' ? '' : 'WHERE companyId = ?'}
       ORDER BY createdAt DESC`,
      values,
    ).catch(() => []);
    return rows.map((row: any) => ({
      ...row,
      permissionSlugs: this.parseJson(row.permissionSlugs) || [],
      scopeValues: this.parseJson(row.scopeValues) || [],
    }));
  }

  async createServiceAccount(dto: any, actor: CurrentUser) {
    const permissions = await this.findPermissionsBySlugs(dto.permissionSlugs || []);
    if (!String(dto.name || '').trim()) throw new BadRequestException('Service account name is required');
    const companyId = actor.role === 'SUPER_ADMIN' ? (dto.companyId || null) : actor.companyId;
    const token = `fsit_sa_${crypto.randomBytes(32).toString('hex')}`;
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO ServiceAccount
       (id, companyId, name, tokenHash, permissionSlugs, scopeType, scopeValues, expiresAt, isActive, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(3), NOW(3))`,
      [
        id, companyId, String(dto.name).trim(), this.hashToken(token),
        JSON.stringify(permissions.map((permission) => permission.slug)),
        dto.scopeType || 'ALL', JSON.stringify(dto.scopeValues || []),
        dto.expiresAt ? new Date(dto.expiresAt) : null, actor.id,
      ],
    );
    await this.recordSecurityAlert(companyId, 'SERVICE_ACCOUNT_CREATED', 'warning', id, `Service account ${dto.name} created`, { actorId: actor.id });
    return { id, token, warning: 'This token is shown once. Store it securely.' };
  }

  async revokeServiceAccount(id: string, actor: CurrentUser) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM ServiceAccount WHERE id = ? LIMIT 1`, [id]);
    const account = rows[0];
    if (!account) throw new NotFoundException('Service account not found');
    if (actor.role !== 'SUPER_ADMIN' && account.companyId !== actor.companyId) throw new ForbiddenException();
    await this.prisma.execute(
      `UPDATE ServiceAccount SET isActive = 0, revokedAt = NOW(3), revokedById = ?, updatedAt = NOW(3) WHERE id = ?`,
      [actor.id, id],
    );
    await this.recordSecurityAlert(account.companyId, 'SERVICE_ACCOUNT_REVOKED', 'warning', id, `Service account ${account.name} revoked`, { actorId: actor.id });
    return { id, revoked: true };
  }

  async getAuthorizationCoverage() {
    const root = path.resolve(process.cwd(), 'src', 'modules');
    const files = this.walkControllerFiles(root);
    const routes = files.flatMap((file) => this.inspectControllerCoverage(file));
    const protectedRoutes = routes.filter((route) => route.authenticated);
    const covered = protectedRoutes.filter((route) => route.permissionProtected);
    const [permissions, assignedRows] = await Promise.all([
      this.listPermissions().catch(() => []),
      this.prisma.query<any[]>(
        `SELECT DISTINCT p.slug FROM RolePermission rp JOIN Permission p ON p.id = rp.permissionId`,
      ).catch(() => []),
    ]);
    const enforcedSlugs = new Set(routes.flatMap((route) => route.permissions || []));
    const assignedSlugs = new Set(assignedRows.map((row: any) => row.slug));
    return {
      totalRoutes: routes.length,
      authenticatedRoutes: protectedRoutes.length,
      permissionProtectedRoutes: covered.length,
      coveragePercent: protectedRoutes.length ? Math.round((covered.length / protectedRoutes.length) * 100) : 100,
      uncovered: protectedRoutes.filter((route) => !route.permissionProtected).slice(0, 100),
      permissionsNeverEnforced: permissions.filter((permission: any) => !enforcedSlugs.has(permission.slug)).map((permission: any) => permission.slug),
      permissionsUnassigned: permissions.filter((permission: any) => !assignedSlugs.has(permission.slug)).map((permission: any) => permission.slug),
      authorizationMatrixCases: protectedRoutes.length * VALID_ROLES.length,
      matrixRoles: VALID_ROLES,
    };
  }

  async requestPermissionApproval(roleId: string, permissionSlugs: string[], reason: string, actor: CurrentUser) {
    const role = await this.assertRoleScope(roleId, actor, true);
    await this.findPermissionsBySlugs(permissionSlugs);
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO PermissionApproval
       (id, companyId, roleId, requestedById, status, requestedPermissions, reason, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?, NOW(3), NOW(3))`,
      [id, role.companyId || actor.companyId || null, roleId, actor.id, JSON.stringify([...new Set(permissionSlugs)]), reason || null],
    );
    await this.recordPermissionAudit(actor, roleId, 'ROLE_PERMISSION_APPROVAL_REQUESTED', { approvalId: id, permissionSlugs, reason }, role.companyId);
    return { id, status: 'PENDING' };
  }

  async reviewPermissionApproval(approvalId: string, decision: 'APPROVED' | 'REJECTED', actor: CurrentUser) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM PermissionApproval WHERE id = ? LIMIT 1`, [approvalId]);
    const approval = rows[0];
    if (!approval) throw new NotFoundException('Approval request not found');
    if (approval.status !== 'PENDING') throw new BadRequestException('Approval request has already been reviewed');
    if (actor.role !== 'SUPER_ADMIN' && approval.companyId !== actor.companyId) throw new ForbiddenException('Approval is outside your tenant');
    if (actor.role !== 'SUPER_ADMIN' && approval.requestedById === actor.id) {
      throw new BadRequestException('A second administrator must review this request');
    }
    if (decision === 'APPROVED') {
      await this.updateRole(approval.roleId, {
        permissionSlugs: this.parseJson(approval.requestedPermissions) || [],
        acknowledgeCriticalRemoval: true,
      }, actor);
    }
    await this.prisma.execute(
      `UPDATE PermissionApproval SET status = ?, approvedById = ?, reviewedAt = NOW(3), updatedAt = NOW(3) WHERE id = ?`,
      [decision, actor.id, approvalId],
    );
    await this.recordPermissionAudit(actor, approval.roleId, `ROLE_PERMISSION_APPROVAL_${decision}`, { approvalId }, approval.companyId);
    return { id: approvalId, status: decision };
  }

  async createTemporaryPermissionGrant(dto: any, actor: CurrentUser) {
    const user = await this.assertUserScope(dto.userId, actor);
    const permissions = await this.findPermissionsBySlugs([dto.permissionSlug]);
    const expiresAt = new Date(dto.expiresAt);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw new BadRequestException('Expiration must be in the future');
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO TemporaryPermissionGrant
       (id, companyId, userId, permissionId, grantedById, scopeType, scopeValue, reason, startsAt, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW(3)), ?, NOW(3))`,
      [
        id, user.companyId || actor.companyId || null, user.id, permissions[0].id, actor.id,
        dto.scopeType || 'ALL', dto.scopeValue ? JSON.stringify(dto.scopeValue) : null,
        dto.reason || null, dto.startsAt ? new Date(dto.startsAt) : null, expiresAt,
      ],
    );
    await this.recordPermissionAudit(actor, user.id, 'TEMPORARY_PERMISSION_GRANTED', {
      grantId: id, permissionSlug: dto.permissionSlug, expiresAt, scopeType: dto.scopeType || 'ALL',
    }, user.companyId);
    await this.revokeSessionsForUsers([user.id], actor.id, 'temporary-permission-granted');
    return { id, expiresAt, status: 'ACTIVE' };
  }

  async revokeTemporaryPermissionGrant(grantId: string, actor: CurrentUser) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM TemporaryPermissionGrant WHERE id = ? LIMIT 1`, [grantId]);
    const grant = rows[0];
    if (!grant) throw new NotFoundException('Temporary grant not found');
    if (actor.role !== 'SUPER_ADMIN' && grant.companyId !== actor.companyId) throw new ForbiddenException('Grant is outside your tenant');
    await this.prisma.execute(`UPDATE TemporaryPermissionGrant SET revokedAt = NOW(3) WHERE id = ?`, [grantId]);
    await this.recordPermissionAudit(actor, grant.userId, 'TEMPORARY_PERMISSION_REVOKED', { grantId }, grant.companyId);
    await this.revokeSessionsForUsers([grant.userId], actor.id, 'temporary-permission-revoked');
    return { id: grantId, status: 'REVOKED' };
  }

  async createPermissionScope(dto: any, actor: CurrentUser) {
    if (!dto.roleId && !dto.userId) throw new BadRequestException('A role or user is required');
    const role = dto.roleId ? await this.assertRoleScope(dto.roleId, actor, false) : null;
    const user = dto.userId ? await this.assertUserScope(dto.userId, actor) : null;
    await this.findPermissionsBySlugs([dto.permissionSlug]);
    if (!PERMISSION_SCOPE_TYPES.some((scope) => scope.key === dto.scopeType)) throw new BadRequestException('Invalid permission scope');
    const id = crypto.randomUUID();
    const companyId = role?.companyId || user?.companyId || actor.companyId || null;
    await this.prisma.execute(
      `INSERT INTO PermissionScope
       (id, companyId, roleId, userId, permissionSlug, scopeType, scopeValues, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [id, companyId, dto.roleId || null, dto.userId || null, dto.permissionSlug, dto.scopeType, JSON.stringify(dto.scopeValues || []), actor.id],
    );
    await this.recordPermissionAudit(actor, dto.roleId || dto.userId, 'PERMISSION_SCOPE_CREATED', { scopeId: id, ...dto }, companyId);
    const scopedUsers = dto.userId
      ? [dto.userId]
      : (await this.prisma.query<any[]>(`SELECT userId FROM UserRole WHERE roleId = ?`, [dto.roleId])).map((item: any) => item.userId);
    await this.revokeSessionsForUsers(scopedUsers, actor.id, 'permission-scope-changed');
    return { id };
  }

  async deletePermissionScope(scopeId: string, actor: CurrentUser) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM PermissionScope WHERE id = ? LIMIT 1`, [scopeId]);
    const scope = rows[0];
    if (!scope) throw new NotFoundException('Permission scope not found');
    if (actor.role !== 'SUPER_ADMIN' && scope.companyId !== actor.companyId) throw new ForbiddenException('Scope is outside your tenant');
    await this.prisma.execute(`DELETE FROM PermissionScope WHERE id = ?`, [scopeId]);
    await this.recordPermissionAudit(actor, scope.roleId || scope.userId, 'PERMISSION_SCOPE_DELETED', { scopeId }, scope.companyId);
    const scopedUsers = scope.userId
      ? [scope.userId]
      : (await this.prisma.query<any[]>(`SELECT userId FROM UserRole WHERE roleId = ?`, [scope.roleId])).map((item: any) => item.userId);
    await this.revokeSessionsForUsers(scopedUsers, actor.id, 'permission-scope-changed');
    return { id: scopeId };
  }

  async simulateUserPermissions(userId: string, actor: CurrentUser) {
    const effective = await this.getEffectivePermissions(userId, actor);
    const slugs = effective.permissions.map((entry: any) => entry.permission.slug);
    return {
      ...effective,
      mode: 'READ_ONLY_SIMULATION',
      risks: this.detectPermissionRisks(slugs),
      missingDependencies: this.detectMissingDependencies(slugs),
      visibleModules: [...new Set(slugs.map((slug: string) => slug.split('.')[0]))].sort(),
    };
  }

  async getPermissionAlerts(actor: CurrentUser) {
    const companyId = actor.role === 'SUPER_ADMIN' ? null : actor.companyId;
    const companyCondition = companyId ? 'AND u.companyId = ?' : '';
    const dormant = await this.prisma.query<any[]>(
      `SELECT u.id, u.firstName, u.lastName, u.email, u.role, u.lastLoginAt
       FROM User u
       WHERE u.deletedAt IS NULL AND u.isActive = 1
         AND u.role IN ('SUPER_ADMIN', 'TENANT_ADMIN')
         AND (u.lastLoginAt IS NULL OR u.lastLoginAt < DATE_SUB(NOW(3), INTERVAL 90 DAY))
         ${companyCondition}
       ORDER BY u.lastLoginAt`,
      companyId ? [companyId] : [],
    );
    const unusedRoles = await this.prisma.query<any[]>(
      `SELECT r.id, r.name, r.slug FROM Role r
       LEFT JOIN UserRole ur ON ur.roleId = r.id
       WHERE r.isSystem = 0 ${companyId ? 'AND r.companyId = ?' : ''}
       GROUP BY r.id HAVING COUNT(ur.userId) = 0`,
      companyId ? [companyId] : [],
    );
    const escalations = await this.prisma.query<any[]>(
      `SELECT a.id, a.resourceId as roleId, a.diff, a.createdAt, u.firstName, u.lastName
       FROM AuditLog a LEFT JOIN User u ON u.id = a.actorId
       WHERE a.resourceType = 'ROLE_PERMISSIONS'
         AND a.action = 'ROLE_PERMISSIONS_UPDATED'
         ${companyId ? 'AND a.companyId = ?' : ''}
       ORDER BY a.createdAt DESC LIMIT 50`,
      companyId ? [companyId] : [],
    );
    const durableAlerts = await this.prisma.query<any[]>(
      `SELECT * FROM SecurityAlert
       WHERE acknowledgedAt IS NULL ${companyId ? 'AND companyId = ?' : ''}
       ORDER BY createdAt DESC LIMIT 100`,
      companyId ? [companyId] : [],
    ).catch(() => []);
    return [
      ...durableAlerts.map((item: any) => ({ ...item, type: item.alertType, detail: this.parseJson(item.detail) })),
      ...dormant.map((item: any) => ({ type: 'DORMANT_PRIVILEGED_USER', severity: item.role === 'SUPER_ADMIN' ? 'critical' : 'warning', ...item })),
      ...unusedRoles.map((item: any) => ({ type: 'UNUSED_ROLE', severity: 'info', ...item })),
      ...escalations.filter((item: any) => {
        const added = this.parseJson(item.diff)?.added || [];
        return added.some((slug: string) => CRITICAL_PERMISSION_SLUGS.includes(slug) || /\.(delete|approve|manage)$/.test(slug));
      }).map((item: any) => ({ type: 'PRIVILEGE_ESCALATION', severity: 'warning', ...item, diff: this.parseJson(item.diff) })),
    ];
  }

  async acknowledgeSecurityAlert(alertId: string, actor: CurrentUser) {
    const rows = await this.prisma.query<any[]>(`SELECT companyId FROM SecurityAlert WHERE id = ? LIMIT 1`, [alertId]);
    if (!rows[0]) throw new NotFoundException('Security alert not found');
    if (actor.role !== 'SUPER_ADMIN' && rows[0].companyId !== actor.companyId) throw new ForbiddenException();
    await this.prisma.execute(
      `UPDATE SecurityAlert SET acknowledgedAt = NOW(3), acknowledgedById = ? WHERE id = ?`,
      [actor.id, alertId],
    );
    return { id: alertId, acknowledged: true };
  }

  async createAccessReview(dto: { name: string; dueAt?: string; cadence?: string; reminderDays?: number }, actor: CurrentUser) {
    const id = crypto.randomUUID();
    const companyId = actor.role === 'SUPER_ADMIN' ? null : actor.companyId;
    await this.prisma.execute(
      `INSERT INTO AccessReviewCampaign
       (id, companyId, name, status, dueAt, cadence, reminderDays, nextRunAt, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
      [
        id, companyId, dto.name, dto.dueAt ? new Date(dto.dueAt) : null,
        ['MONTHLY', 'QUARTERLY'].includes(String(dto.cadence || '').toUpperCase()) ? String(dto.cadence).toUpperCase() : null,
        Math.max(1, Number(dto.reminderDays || 7)),
        dto.cadence ? new Date(Date.now() + (String(dto.cadence).toUpperCase() === 'MONTHLY' ? 30 : 90) * 86400000) : null,
        actor.id,
      ],
    );
    const users = await this.prisma.query<any[]>(
      `SELECT id FROM User WHERE deletedAt IS NULL AND isActive = 1 ${companyId ? 'AND companyId = ?' : ''}`,
      companyId ? [companyId] : [],
    );
    for (const user of users) {
      await this.prisma.execute(
        `INSERT IGNORE INTO AccessReviewItem (id, campaignId, userId, decision, createdAt, updatedAt)
         VALUES (?, ?, ?, 'PENDING', NOW(3), NOW(3))`,
        [crypto.randomUUID(), id, user.id],
      );
    }
    return { id, itemCount: users.length, status: 'OPEN' };
  }

  async getAccessReview(reviewId: string, actor: CurrentUser) {
    const campaigns = await this.prisma.query<any[]>(`SELECT * FROM AccessReviewCampaign WHERE id = ? LIMIT 1`, [reviewId]);
    const campaign = campaigns[0];
    if (!campaign) throw new NotFoundException('Access review not found');
    if (actor.role !== 'SUPER_ADMIN' && campaign.companyId !== actor.companyId) throw new ForbiddenException('Review is outside your tenant');
    const items = await this.prisma.query<any[]>(
      `SELECT ari.*, u.firstName, u.lastName, u.email, u.role, u.lastLoginAt
       FROM AccessReviewItem ari JOIN User u ON u.id = ari.userId
       WHERE ari.campaignId = ? ORDER BY u.firstName, u.lastName`,
      [reviewId],
    );
    return { ...campaign, items };
  }

  async decideAccessReviewItem(reviewId: string, itemId: string, dto: { decision: 'CERTIFIED' | 'REVOKE'; notes?: string }, actor: CurrentUser) {
    await this.getAccessReview(reviewId, actor);
    await this.prisma.execute(
      `UPDATE AccessReviewItem SET decision = ?, notes = ?, reviewerId = ?, reviewedAt = NOW(3), updatedAt = NOW(3)
       WHERE id = ? AND campaignId = ?`,
      [dto.decision, dto.notes || null, actor.id, itemId, reviewId],
    );
    if (dto.decision === 'REVOKE') {
      const rows = await this.prisma.query<any[]>(`SELECT userId FROM AccessReviewItem WHERE id = ? LIMIT 1`, [itemId]);
      const user = rows[0] ? await this.prisma.user.findUnique({ where: { id: rows[0].userId } }) : null;
      if (user?.role === 'SUPER_ADMIN') await this.assertNotLastSuperAdmin(user.id);
      await this.prisma.execute(`DELETE FROM UserRole WHERE userId = ?`, [rows[0]?.userId]);
    }
    const pending = await this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM AccessReviewItem WHERE campaignId = ? AND decision = 'PENDING'`, [reviewId]);
    if (Number(pending[0]?.count || 0) === 0) {
      await this.prisma.execute(`UPDATE AccessReviewCampaign SET status = 'COMPLETED', completedAt = NOW(3), updatedAt = NOW(3) WHERE id = ?`, [reviewId]);
    }
    return { id: itemId, decision: dto.decision };
  }

  async exportAccessReview(reviewId: string, format: 'csv' | 'pdf', actor: CurrentUser, approvalRequestId?: string) {
    await this.accessGovernance.assertApprovedAction(approvalRequestId || '', 'AUDIT_EXPORT', reviewId, actor);
    const review = await this.getAccessReview(reviewId, actor);
    const lines: unknown[][] = [
      ['User', 'Email', 'Primary role', 'Decision', 'Reviewer notes', 'Last login'],
      ...review.items.map((item: any) => [
        `${item.firstName} ${item.lastName}`, item.email, item.role, item.decision,
        item.notes || '', item.lastLoginAt ? new Date(item.lastLoginAt).toISOString() : 'Never',
      ]),
    ];
    await this.recordSecurityAlert(actor.companyId, 'ACCESS_REVIEW_EXPORTED', 'info', reviewId, `Access review exported as ${format.toUpperCase()}`, { actorId: actor.id });
    if (format === 'pdf') {
      const text = [`Access review: ${review.name}`, `Status: ${review.status}`, '', ...lines.map((row) => row.join(' | '))];
      return { filename: `access-review-${reviewId}.pdf`, mimeType: 'application/pdf', contentBase64: this.createSimplePdf(text).toString('base64') };
    }
    const csv = lines.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    return { filename: `access-review-${reviewId}.csv`, mimeType: 'text/csv', contentBase64: Buffer.from(csv).toString('base64') };
  }

  private async assertUserScope(userId: string, actor: CurrentUser) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    if (actor.role !== 'SUPER_ADMIN' && user.companyId !== actor.companyId) {
      throw new ForbiddenException('User is outside your tenant');
    }
    return user;
  }

  private async assertNotLastSuperAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.role !== 'SUPER_ADMIN') return;
    const rows = await this.prisma.query<any[]>(
      `SELECT COUNT(*) as count FROM User
       WHERE role = 'SUPER_ADMIN' AND isActive = 1 AND deletedAt IS NULL AND id <> ?`,
      [userId],
    );
    if (Number(rows[0]?.count || 0) === 0) {
      throw new BadRequestException('Cannot remove access from the final active super admin');
    }
  }

  private async assertNotLastBreakGlassAccount(userId: string) {
    const rows = await this.prisma.query<any[]>(
      `SELECT COUNT(*) as count FROM User
       WHERE role = 'SUPER_ADMIN' AND isBreakGlass = 1 AND isActive = 1 AND deletedAt IS NULL AND id <> ?`,
      [userId],
    );
    if (Number(rows[0]?.count || 0) === 0) {
      throw new BadRequestException('At least one active break-glass super admin must remain');
    }
  }

  private async revokeSessionsForUsers(userIds: string[], actorId: string, reason: string) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return;
    await this.prisma.execute(
      `UPDATE Session SET revokedAt = NOW(3), revokedById = ?, revokeReason = ?
       WHERE revokedAt IS NULL AND userId IN (${ids.map(() => '?').join(', ')})`,
      [actorId, reason, ...ids],
    ).catch(() => {});
    await this.prisma.execute(
      `UPDATE User SET authVersion = authVersion + 1 WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    ).catch(() => {});
  }

  private async recordSecurityAlert(companyId: string | null, alertType: string, severity: string, subjectId: string, summary: string, detail: any) {
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO SecurityAlert
       (id, companyId, alertType, severity, subjectId, summary, detail, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [id, companyId, alertType, severity, subjectId, summary.slice(0, 255), JSON.stringify(detail)],
    ).catch(() => {});
    this.accessGovernance.streamSecurityEvent(companyId, { id, alertType, severity, subjectId, summary, detail, createdAt: new Date().toISOString() }).catch(() => {});
  }

  private hashToken(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private walkControllerFiles(root: string): string[] {
    if (!fs.existsSync(root)) return [];
    const files: string[] = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) files.push(...this.walkControllerFiles(fullPath));
      if (entry.isFile() && entry.name.endsWith('controller.ts')) files.push(fullPath);
    }
    return files;
  }

  private inspectControllerCoverage(file: string) {
    const source = fs.readFileSync(file, 'utf8');
    const controller = source.match(/@Controller\(([^)]*)\)/)?.[1]?.replace(/['"`]/g, '') || path.basename(file);
    const classUsesJwt = /@UseGuards\([^)]*JwtAuthGuard/.test(source);
    const classUsesPermissions = /@UseGuards\([^)]*PermissionsGuard/.test(source) || /@RequirePermissions\(/.test(source.split('export class')[0] || '');
    const lines = source.split(/\r?\n/);
    const routes: any[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const route = lines[index].match(/@(Get|Post|Patch|Put|Delete)\(([^)]*)\)/);
      if (!route) continue;
      const decoratorLines = [lines[index]];
      for (let before = index - 1; before >= 0 && lines[before].trim().startsWith('@'); before -= 1) decoratorLines.unshift(lines[before]);
      for (let after = index + 1; after < lines.length && lines[after].trim().startsWith('@'); after += 1) decoratorLines.push(lines[after]);
      const decorators = decoratorLines.join('\n');
      const isPublic = /@Public\(\)/.test(decorators);
      routes.push({
        controller,
        method: route[1].toUpperCase(),
        path: route[2].replace(/['"`]/g, ''),
        file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
        line: index + 1,
        authenticated: !isPublic && (classUsesJwt || /JwtAuthGuard/.test(decorators)),
        permissionProtected: isPublic || /@AuthorizationExempt\(/.test(decorators) || classUsesPermissions || /@RequirePermissions\(/.test(decorators),
        permissions: [...decorators.matchAll(/@RequirePermissions\(([^)]*)\)/g)]
          .flatMap((match) => [...match[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((item) => item[1])),
      });
    }
    return routes;
  }

  private createSimplePdf(lines: string[]) {
    const escapedLines = lines.slice(0, 48).map((line) => line.replace(/[\\()]/g, '\\$&'));
    const content = [
      'BT',
      '/F1 10 Tf',
      '50 780 Td',
      ...escapedLines.map((line, index) => `${index === 0 ? '' : '0 -14 Td'}(${line}) Tj`),
      'ET',
    ].join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    ];
    let body = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(body));
      body += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(body);
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { body += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(body);
  }

  private async assertRoleScope(roleId: string, actor: CurrentUser, requireEditable: boolean) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (actor.role === 'SUPER_ADMIN') return role;
    if (requireEditable && role.isSystem) throw new ForbiddenException('System roles can only be changed by a super admin');
    if (role.companyId && role.companyId !== actor.companyId) throw new ForbiddenException('Role is outside your tenant');
    if (requireEditable && role.companyId !== actor.companyId) throw new ForbiddenException('Only tenant-owned roles can be changed');
    return role;
  }

  private detectPermissionRisks(permissionSlugs: string[]) {
    const values = new Set(permissionSlugs);
    const risks: any[] = [];
    for (const rule of PERMISSION_RISK_RULES) {
      if ('whenAll' in rule && rule.whenAll?.every((slug) => values.has(slug)) && rule.missingAny?.every((slug) => !values.has(slug))) {
        risks.push({ key: rule.key, severity: rule.severity, message: rule.message });
      }
      if ('pattern' in rule && rule.pattern && rule.requiredSuffix) {
        [...values].filter((slug) => slug.endsWith(rule.pattern!)).forEach((slug) => {
          const required = `${slug.slice(0, -rule.pattern!.length)}${rule.requiredSuffix}`;
          if (!values.has(required)) risks.push({ key: `${rule.key}:${slug}`, severity: rule.severity, message: `${rule.message} Missing ${required}.` });
        });
      }
    }
    return risks;
  }

  private detectMissingDependencies(permissionSlugs: string[]) {
    const values = new Set(permissionSlugs);
    return Object.entries(PERMISSION_DEPENDENCIES)
      .filter(([permission]) => values.has(permission))
      .flatMap(([permission, dependencies]) =>
        dependencies
          .filter((dependency) => !values.has(dependency))
          .map((dependency) => ({ permission, dependency })),
      );
  }

  private async recordPermissionAudit(actor: CurrentUser, roleId: string, action: string, diff: any, companyId?: string | null) {
    await this.auditLogService.create({
      companyId: companyId || actor.companyId || 'platform',
      actorId: actor.id,
      action,
      resourceType: 'ROLE_PERMISSIONS',
      resourceId: roleId,
      diff: JSON.stringify(diff),
    });
  }

  private parseJson(value?: string | null) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return value; }
  }

  async createRole(dto: { name: string; slug: string; description?: string; companyId?: string; permissionSlugs?: string[] }) {
    const existing = await this.prisma.role.findUnique({
      where: { slug_companyId: { slug: dto.slug, companyId: dto.companyId || '' } },
    });
    if (existing) throw new BadRequestException('Role slug already exists for this company');

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        companyId: dto.companyId || null,
      },
    });

    if (dto.permissionSlugs?.length) {
      const permissions = await this.findPermissionsBySlugs(dto.permissionSlugs);
      await this.prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
    }

    return this.getRole(role.id);
  }

  async updateRole(
    roleId: string,
    dto: { name?: string; description?: string; permissionSlugs?: string[]; acknowledgeCriticalRemoval?: boolean },
    actor?: CurrentUser,
  ) {
    const role = actor
      ? await this.assertRoleScope(roleId, actor, true)
      : await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    const beforeRole = dto.permissionSlugs !== undefined ? await this.getRole(roleId) : null;
    if (actor && dto.permissionSlugs !== undefined) {
      const analysis = await this.analyzePermissionChange(roleId, dto.permissionSlugs, actor);
      if (analysis.requiresAcknowledgement && !dto.acknowledgeCriticalRemoval) {
        throw new BadRequestException({
          message: 'Removing critical permissions from a role with active users requires acknowledgement',
          code: 'CRITICAL_PERMISSION_REMOVAL',
          analysis,
        });
      }
    }

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;

    if (dto.permissionSlugs !== undefined) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId } });
      if (dto.permissionSlugs.length > 0) {
        const perms = await this.findPermissionsBySlugs(dto.permissionSlugs);
        await this.prisma.rolePermission.createMany({
          data: perms.map((p) => ({ roleId, permissionId: p.id })),
        });
      }
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: updateData,
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { userRoles: true } },
      },
    }).then((result: any) => this.normalizeRole(result));

    if (actor && dto.permissionSlugs !== undefined) {
      const before: string[] = (beforeRole?.permissions || []).map((entry: any) => String(entry.permission.slug)).sort();
      const after: string[] = [...dto.permissionSlugs].sort();
      await this.recordPermissionAudit(actor, roleId, 'ROLE_PERMISSIONS_UPDATED', {
        roleName: role.name,
        before,
        after,
        added: after.filter((slug) => !before.includes(slug)),
        removed: before.filter((slug) => !after.includes(slug)),
      }, role.companyId);
      const affected = await this.prisma.query<any[]>(`SELECT userId FROM UserRole WHERE roleId = ?`, [roleId]);
      await this.revokeSessionsForUsers(affected.map((item: any) => item.userId), actor.id, 'role-permissions-changed');
    }
    return updated;
  }

  async rollbackRolePermissions(roleId: string, historyId: string, actor: CurrentUser) {
    await this.assertRoleScope(roleId, actor, true);
    const rows = await this.prisma.query<any[]>(
      `SELECT id, companyId, resourceId, diff
       FROM AuditLog
       WHERE id = ? AND resourceType = 'ROLE_PERMISSIONS' AND resourceId = ?
       LIMIT 1`,
      [historyId, roleId],
    );
    const entry = rows[0];
    if (!entry) throw new NotFoundException('Permission history version not found');
    if (actor.role !== 'SUPER_ADMIN' && entry.companyId !== actor.companyId) {
      throw new ForbiddenException('Permission history version is outside your tenant');
    }
    const diff = this.parseJson(entry.diff) || {};
    if (!Array.isArray(diff.before)) throw new BadRequestException('Permission history version cannot be restored');
    return this.updateRole(roleId, {
      permissionSlugs: diff.before,
      acknowledgeCriticalRemoval: true,
    }, actor);
  }

  async deleteRole(roleId: string, actor?: CurrentUser) {
    const role = actor
      ? await this.assertRoleScope(roleId, actor, true)
      : await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('Cannot delete system roles');

    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    await this.prisma.userRole.deleteMany({ where: { roleId } });
    return this.prisma.role.delete({ where: { id: roleId } });
  }

  // ── User-Role assignments ──

  async assignUserRole(userId: string, roleId: string, actor?: CurrentUser) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (actor?.role !== 'SUPER_ADMIN' && user.companyId !== actor?.companyId) throw new ForbiddenException('User is outside your tenant');

    const role = actor ? await this.assertRoleScope(roleId, actor, false) : await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    if (role.companyId && role.companyId !== user.companyId) {
      throw new BadRequestException('Role does not belong to the user\'s company');
    }

    const assignment = await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
      include: { role: true },
    });
    if (actor) await this.revokeSessionsForUsers([userId], actor.id, 'role-assigned');
    return assignment;
  }

  async removeUserRole(userId: string, roleId: string, actor?: CurrentUser) {
    if (actor && actor.role !== 'SUPER_ADMIN') {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.companyId !== actor.companyId) throw new ForbiddenException('User is outside your tenant');
      await this.assertRoleScope(roleId, actor, false);
    }
    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (!existing) throw new NotFoundException('User-role assignment not found');
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.role.findUnique({ where: { id: roleId } }),
    ]);
    if (user?.role === 'SUPER_ADMIN' && (role?.slug === 'super-admin' || role?.name === 'SUPER_ADMIN')) {
      await this.assertNotLastSuperAdmin(userId);
    }
    const removed = await this.prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
    if (actor) await this.revokeSessionsForUsers([userId], actor.id, 'role-removed');
    return removed;
  }

  async getUserRoles(userId: string, actor?: CurrentUser) {
    if (actor?.role !== 'SUPER_ADMIN') {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.companyId !== actor?.companyId) throw new ForbiddenException('User is outside your tenant');
    }
    return this.prisma.userRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });
  }

  // ── Legacy role methods (backward compat) ──

  listRolesLegacy() {
    return VALID_ROLES.map((role, index) => ({
      id: index + 1,
      name: role,
      description: this.getRoleDescription(role),
    }));
  }

  private getRoleDescription(role: string): string {
    const descriptions: Record<string, string> = {
      SUPER_ADMIN: 'Full system access across all tenants',
      GLOBAL_TECH: 'Platform technician for free and starter individual tickets',
      TENANT_ADMIN: 'Administrator for a single company/tenant',
      TECHNICIAN: 'Field service technician with dispatch access',
      CLIENT: 'Standard end user',
      READ_ONLY: 'View-only access',
    };
    return descriptions[role] || '';
  }

  async listUsers(query: { page?: number; limit?: number; search?: string; role?: string; userType?: string; companyId?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (query.search) {
      where.OR = [
        { email: { contains: query.search } },
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
      ];
    }
    if (query.role) where.role = query.role;
    if (query.userType) where.userType = query.userType;
    if (query.companyId) where.companyId = query.companyId;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          userType: true,
          companyId: true,
          company: { select: { id: true, name: true } },
          isActive: true,
          emailVerified: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, userType: true,
        companyId: true, company: { select: { id: true, name: true } },
        isActive: true, emailVerified: true, phone: true, lastLoginAt: true, createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async listTickets(query: { page?: number; limit?: number; search?: string; status?: string; priority?: string; companyId?: string }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;
    const where = ['t.deletedAt IS NULL'];
    const values: any[] = [];

    if (query.companyId) {
      where.push('t.companyId = ?');
      values.push(query.companyId);
    }
    if (query.status) {
      where.push('t.status = ?');
      values.push(query.status);
    }
    if (query.priority) {
      where.push('t.priority = ?');
      values.push(query.priority);
    }
    if (query.search) {
      where.push('(t.title LIKE ? OR t.ticketNumber LIKE ? OR t.description LIKE ? OR t.contactName LIKE ? OR t.contactEmail LIKE ?)');
      const term = `%${query.search}%`;
      values.push(term, term, term, term, term);
    }

    const whereSql = where.join(' AND ');
    const [data, totalRows] = await Promise.all([
      this.prisma.query<any[]>(
        `SELECT
           t.id, t.ticketNumber, t.title, t.status, t.priority, t.category, t.contactName, t.contactEmail,
           t.companyId, t.createdById, t.assignedToId, t.createdAt, t.updatedAt,
           c.name as companyName,
           creator.firstName as createdByFirstName, creator.lastName as createdByLastName,
           assignee.firstName as assignedToFirstName, assignee.lastName as assignedToLastName
         FROM Ticket t
         LEFT JOIN \`Company\` c ON c.id = t.companyId
         LEFT JOIN \`User\` creator ON creator.id = t.createdById
         LEFT JOIN \`User\` assignee ON assignee.id = t.assignedToId
         WHERE ${whereSql}
         ORDER BY t.createdAt DESC
         LIMIT ? OFFSET ?`,
        [...values, limit, skip],
      ),
      this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM Ticket t WHERE ${whereSql}`, values),
    ]);

    return {
      data: data.map((ticket) => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        contactName: ticket.contactName,
        contactEmail: ticket.contactEmail,
        companyId: ticket.companyId,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        company: ticket.companyId ? { id: ticket.companyId, name: ticket.companyName || 'Unknown company' } : null,
        createdBy: ticket.createdById ? { id: ticket.createdById, firstName: ticket.createdByFirstName, lastName: ticket.createdByLastName } : null,
        assignedTo: ticket.assignedToId ? { id: ticket.assignedToId, firstName: ticket.assignedToFirstName, lastName: ticket.assignedToLastName } : null,
      })),
      meta: { page, limit, total: Number(totalRows[0]?.count || 0), totalPages: Math.ceil(Number(totalRows[0]?.count || 0) / limit) },
    };
  }

  async createUser(dto: { email: string; password: string; firstName: string; lastName: string; role?: string; companyId?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const role = dto.role && VALID_ROLES.includes(dto.role) ? dto.role : 'CLIENT';
    const isGlobalRole = GLOBAL_ROLES.includes(role);

    if (!isGlobalRole) {
      if (!dto.companyId) throw new BadRequestException('Company is required for tenant users');
      const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
      if (!company) throw new BadRequestException('Company not found');
    }

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role,
        userType: 'BUSINESS',
        companyId: isGlobalRole ? null : dto.companyId,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true },
    });
  }

  async updateUserRole(userId: string, role: string, actor?: CurrentUser) {
    if (!VALID_ROLES.includes(role)) {
      throw new BadRequestException('Invalid role');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
      await this.assertNotLastSuperAdmin(userId);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role, ...(GLOBAL_ROLES.includes(role) ? { companyId: null } : {}) },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    if (actor) await this.revokeSessionsForUsers([userId], actor.id, 'primary-role-changed');
    return updated;
  }

  async updateUser(id: string, dto: any, actor?: CurrentUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (
      user.role === 'SUPER_ADMIN'
      && ((dto.role && dto.role !== 'SUPER_ADMIN') || dto.isActive === false)
    ) {
      await this.assertNotLastSuperAdmin(id);
    }

    const updateData: any = {};
    if (dto.firstName) updateData.firstName = dto.firstName;
    if (dto.lastName) updateData.lastName = dto.lastName;
    if (dto.role && VALID_ROLES.includes(dto.role)) {
      updateData.role = dto.role;
      if (GLOBAL_ROLES.includes(dto.role)) updateData.companyId = null;
    }
    if (dto.userType && ['PUBLIC', 'BUSINESS'].includes(dto.userType)) updateData.userType = dto.userType;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
      if (!company) throw new BadRequestException('Company not found');
      updateData.companyId = dto.companyId;
    }
    if (dto.companyId === null) updateData.companyId = null;

    const updated = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, userType: true, isActive: true, companyId: true },
    });
    if (actor && (dto.role !== undefined || dto.userType !== undefined || dto.isActive !== undefined || dto.companyId !== undefined)) {
      await this.revokeSessionsForUsers([id], actor.id, 'user-access-changed');
    }
    return updated;
  }

  async assignUserCompany(id: string, companyId: string | null, reason: string, actor: CurrentUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (GLOBAL_ROLES.includes(user.role) && companyId) {
      throw new BadRequestException('Global users use company context and cannot be pinned to one company');
    }
    if (companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: companyId } });
      if (!company || company.deletedAt) throw new BadRequestException('Company not found');
    }

    await this.prisma.execute(
      `INSERT INTO UserCompanyAssignmentHistory
       (id, userId, previousCompanyId, nextCompanyId, actorId, reason, createdAt)
       VALUES (UUID(), ?, ?, ?, ?, ?, NOW(3))`,
      [id, user.companyId, companyId, actor.id, String(reason || 'Administrative company assignment')],
    );
    const updated = await this.prisma.user.update({
      where: { id },
      data: { companyId, authVersion: { increment: 1 } },
      select: { id: true, email: true, role: true, companyId: true },
    });
    await this.revokeSessionsForUsers([id], actor.id, 'company-assignment-changed');
    return updated;
  }

  async removeUser(id: string, actor?: CurrentUser) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.assertNotLastSuperAdmin(id);

    const removed = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true, email: true },
    });
    if (actor) await this.revokeSessionsForUsers([id], actor.id, 'user-removed');
    return removed;
  }

  async listCompanies(query: { page?: number; limit?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { slug: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { users: true, tickets: true, assets: true } } },
      }),
      this.prisma.company.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async createCompany(dto: { name: string; slug: string; domain?: string }) {
    const existing = await this.prisma.company.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new BadRequestException('Company slug already exists');

    return this.prisma.company.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        domain: dto.domain,
        settings: JSON.stringify({ timezone: 'UTC', locale: 'en-US' }),
      },
    });
  }

  async updateCompany(id: string, dto: { name?: string; slug?: string; domain?: string; isActive?: boolean }) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.domain !== undefined) data.domain = dto.domain;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.company.update({
      where: { id },
      data,
    });
  }

  async removeCompany(id: string, actor: CurrentUser, approvalRequestId?: string) {
    await this.accessGovernance.assertApprovedAction(approvalRequestId || '', 'TENANT_DELETE', id, actor);
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    await this.prisma.user.updateMany({
      where: { companyId: id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async generateInviteCode(companyId: string, expiresInDays: number = 30) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const inviteExpiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    return this.prisma.company.update({
      where: { id: companyId },
      data: { inviteCode, inviteExpiresAt },
      select: { id: true, name: true, inviteCode: true, inviteExpiresAt: true },
    });
  }

  async auditCompanyContext(actorId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({ where: { id: companyId, deletedAt: null } });
    if (!company) throw new NotFoundException('Company not found');

    await this.auditLogService.create({
      companyId,
      actorId,
      action: 'SUPER_ADMIN.COMPANY_CONTEXT',
      resourceType: 'Company',
      resourceId: companyId,
      diff: JSON.stringify({ selectedCompany: { id: company.id, name: company.name } }),
    });

    return { ok: true };
  }

  async listCompanyUsers(companyId: string, query: { page?: number; limit?: number; search?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = { companyId, deletedAt: null };
    if (query.search) {
      where.OR = [
        { email: { contains: query.search } },
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async updateCompanyUserRole(userId: string, role: string, companyId: string, actor?: CurrentUser) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found in your company');
    assertTenantRoleChange({ id: String(user.id), role: String(user.role) }, role, actor);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
    if (actor) await this.revokeSessionsForUsers([userId], actor.id, 'primary-role-changed');
    return updated;
  }

  async getCompanyUser(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, userType: true,
        isActive: true, emailVerified: true, phone: true, lastLoginAt: true, createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found in your company');
    return user;
  }

  async getCompanySettings(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true, domain: true, logo: true, branding: true, settings: true, inviteCode: true, inviteExpiresAt: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    return {
      ...company,
      settings: company.settings ? JSON.parse(company.settings) : {},
      branding: company.branding ? JSON.parse(company.branding) : {},
    };
  }

  async updateCompanySettings(companyId: string, dto: any) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.domain !== undefined) updateData.domain = dto.domain;
    if (dto.logo !== undefined) updateData.logo = dto.logo;
    if (dto.branding) updateData.branding = typeof dto.branding === 'string' ? dto.branding : JSON.stringify(dto.branding);
    if (dto.settings) updateData.settings = typeof dto.settings === 'string' ? dto.settings : JSON.stringify(dto.settings);

    return this.prisma.company.update({
      where: { id: companyId },
      data: updateData,
      select: { id: true, name: true, domain: true, logo: true, branding: true, settings: true },
    });
  }

  async updateCompanyFeatureOverrides(companyId: string, dto: { featureOverrides?: Record<string, boolean>; restrictions?: Record<string, any> }) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    let settings: any = {};
    if (company.settings) {
      try { settings = JSON.parse(company.settings); } catch { settings = {}; }
    }
    settings.featureOverrides = {
      ...(settings.featureOverrides || {}),
      ...(dto.featureOverrides || {}),
    };
    settings.restrictions = {
      ...(settings.restrictions || {}),
      ...(dto.restrictions || {}),
    };

    return this.prisma.company.update({
      where: { id: companyId },
      data: { settings: JSON.stringify(settings) },
      select: { id: true, name: true, settings: true },
    });
  }

  listFunctionControls() {
    return FEATURE_KEYS.map((key) => ({ key, label: this.featureLabel(key) }));
  }

  async getCompanyFeatureControls(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    const settings = company.settings ? JSON.parse(company.settings) : {};
    return {
      companyId,
      featureOverrides: settings.featureOverrides || {},
      restrictions: settings.restrictions || {},
    };
  }

  async updateUserFeatureControls(userId: string, dto: { featureOverrides?: Record<string, boolean> }) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({
      where: { id: userId },
      data: { featureOverrides: JSON.stringify(dto.featureOverrides || {}) },
      select: { id: true },
    });
    return { userId, featureOverrides: dto.featureOverrides || {} };
  }

  async getUserFeatureControls(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return {
      userId,
      featureOverrides: user.featureOverrides ? JSON.parse(user.featureOverrides) : {},
    };
  }

  private featureLabel(key: string) {
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
  }

  async createCompanyUser(
    dto: { email: string; password: string; firstName: string; lastName: string; role?: string },
    companyId: string,
    actor?: CurrentUser,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already in use');

    const assignableRoles = tenantAssignableRoles(actor);
    if (dto.role && !assignableRoles.includes(dto.role)) {
      throw new ForbiddenException('Only a super admin can create a tenant admin');
    }
    const role = dto.role || 'CLIENT';
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.prisma.user.create({
      data: {
        email: dto.email, passwordHash, firstName: dto.firstName, lastName: dto.lastName,
        role, userType: 'BUSINESS', companyId,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
  }

  async removeCompanyUser(userId: string, companyId: string, actor?: CurrentUser) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found in your company');

    const removed = await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true, email: true },
    });
    if (actor) await this.revokeSessionsForUsers([userId], actor.id, 'user-removed');
    return removed;
  }

  async listAuditLogs(query: { page?: number; limit?: number; companyId?: string }) {
    return this.auditLogService.findMany(query);
  }

  async getSystemReadiness() {
    const checks: any[] = [];
    const add = (name: string, ok: boolean, detail: string, severity: 'info' | 'warning' | 'critical' = 'info') => {
      checks.push({ name, status: ok ? 'ok' : severity, detail });
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      add('Database', true, 'SQL connection is responding.');
    } catch (err: any) {
      add('Database', false, err?.message || 'SQL connection failed.', 'critical');
    }

    const plans = await this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
    const businessPlan = plans.find((plan: any) => String(plan.name).toLowerCase() === 'business');
    const starterPlan = plans.find((plan: any) => String(plan.name).toLowerCase() === 'starter');
    const paypalClientConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
    const paypalWebhookConfigured = Boolean(process.env.PAYPAL_WEBHOOK_ID);
    const paypalPrices = await this.prisma.query<any[]>(
      `SELECT planId, billingInterval FROM BillingPrice WHERE provider = 'PAYPAL' AND component = 'BASE' AND isActive = 1`,
    ).catch(() => []);
    const paypalPriceKeys = new Set(paypalPrices.map((price) => `${price.planId}:${price.billingInterval}`));

    add('PayPal API credentials', paypalClientConfigured, paypalClientConfigured ? 'PayPal client ID and secret are configured.' : 'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET before taking paid signups.', 'critical');
    add('PayPal webhook', paypalWebhookConfigured, paypalWebhookConfigured ? 'PAYPAL_WEBHOOK_ID is configured.' : 'Configure PayPal webhook endpoint /v1/billing/webhook/paypal.', 'critical');
    add('Business monthly plan', Boolean(businessPlan && paypalPriceKeys.has(`${businessPlan.id}:MONTH`)), businessPlan && paypalPriceKeys.has(`${businessPlan.id}:MONTH`) ? 'Business monthly PayPal plan is mapped.' : 'Map the Business monthly PayPal plan ID.', 'warning');
    add('Business annual plan', Boolean(businessPlan && paypalPriceKeys.has(`${businessPlan.id}:YEAR`)), businessPlan && paypalPriceKeys.has(`${businessPlan.id}:YEAR`) ? 'Business annual PayPal plan is mapped.' : 'Map the Business annual PayPal plan ID.', 'warning');
    if (starterPlan && Number(starterPlan.monthlyPrice || 0) > 0) {
      add('Starter monthly plan', paypalPriceKeys.has(`${starterPlan.id}:MONTH`), paypalPriceKeys.has(`${starterPlan.id}:MONTH`) ? 'Starter monthly PayPal plan is mapped.' : 'Map the Starter monthly PayPal plan ID.', 'warning');
    }
    add('Frontend URL', Boolean(process.env.FRONTEND_URL), process.env.FRONTEND_URL ? `FRONTEND_URL is ${process.env.FRONTEND_URL}.` : 'Set FRONTEND_URL for checkout redirects.', 'warning');
    add('CORS origin', Boolean(process.env.CORS_ORIGIN), process.env.CORS_ORIGIN ? `CORS_ORIGIN is ${process.env.CORS_ORIGIN}.` : 'Set CORS_ORIGIN to the production frontend domain.', 'warning');
    add('JWT secret', Boolean(process.env.JWT_SECRET), process.env.JWT_SECRET ? 'JWT_SECRET is configured.' : 'Set a strong JWT_SECRET before launch.', 'critical');

    let pendingCommands = 0;
    try {
      const rows = await this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM MdmCommand WHERE status = 'PENDING'`);
      pendingCommands = Number(rows[0]?.count || 0);
      add('MDM command queue', true, `${pendingCommands} pending command${pendingCommands === 1 ? '' : 's'} in queue.`);
    } catch {
      add('MDM command queue', false, 'MDM command table has not been initialized yet.', 'warning');
    }

    let lastRmmSync: any = null;
    try {
      const rows = await this.prisma.query<any[]>(
        `SELECT provider, status, completedAt, assetsCreated, assetsUpdated, assetsSkipped, errorMessage
         FROM RmmSyncRun
         ORDER BY startedAt DESC
         LIMIT 1`,
      );
      lastRmmSync = rows[0] || null;
      add('RMM sync worker', true, lastRmmSync ? `Last ${lastRmmSync.provider} sync ${lastRmmSync.status}.` : 'No RMM sync runs recorded yet.', 'warning');
    } catch {
      add('RMM sync worker', false, 'RMM sync history table has not been initialized yet.', 'warning');
    }

    let lastNetworkPoll: any = null;
    try {
      const rows = await this.prisma.query<any[]>(
        `SELECT source, status, createdAt
         FROM NetworkHealthSnapshot
         ORDER BY createdAt DESC
         LIMIT 1`,
      );
      lastNetworkPoll = rows[0] || null;
      add('Monitoring worker', true, lastNetworkPoll ? `Last ${lastNetworkPoll.source} poll reported ${lastNetworkPoll.status}.` : 'No monitoring snapshots recorded yet.', 'warning');
    } catch {
      add('Monitoring worker', false, 'Monitoring tables have not been initialized yet.', 'warning');
    }

    const status = checks.some((check) => check.status === 'critical')
      ? 'blocked'
      : checks.some((check) => check.status === 'warning')
        ? 'needs_attention'
        : 'ready';

    return {
      status,
      generatedAt: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      databaseName: process.env.DB_NAME || 'configured',
      apiPrefix: '/v1',
      paypalWebhookPath: '/v1/billing/webhook/paypal',
      deployment: {
        frontendVersion: process.env.FRONTEND_VERSION || process.env.APP_VERSION || 'unknown',
        backendVersion: process.env.BACKEND_VERSION || process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
        nodeEnv: process.env.NODE_ENV || 'development',
        corsOrigin: process.env.CORS_ORIGIN || null,
        lastNetworkPoll,
        lastRmmSync,
      },
      plans: plans.map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        isActive: Boolean(plan.isActive),
        monthlyPrice: Number(plan.monthlyPrice || 0),
        paypalPriceConfigured: paypalPriceKeys.has(`${plan.id}:MONTH`) || paypalPriceKeys.has(`${plan.id}:YEAR`),
      })),
      mdm: { pendingCommands },
      checks,
    };
  }

  async getGlobalStats() {
    const [totalUsers, totalCompanies, totalTickets, totalAssets, usersByType, ticketsByStatus] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.company.count({ where: { deletedAt: null } }),
      this.prisma.ticket.count({ where: { deletedAt: null } }),
      this.prisma.asset.count({ where: { deletedAt: null } }),
      this.prisma.user.groupBy({
        by: ['userType'],
        _count: true,
      }),
      this.prisma.ticket.groupBy({
        by: ['status'],
        _count: true,
        where: { deletedAt: null },
      }),
    ]);

    return { totalUsers, totalCompanies, totalTickets, totalAssets, usersByType, ticketsByStatus };
  }
}
