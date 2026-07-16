import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { CurrentUser } from '../../../common/types';
import { decryptSecret, encryptSecret } from '../../../common/security/encryption';
import { Cron } from '@nestjs/schedule';

const SENSITIVE_ACTIONS = new Set([
  'TENANT_DELETE',
  'AUDIT_EXPORT',
  'BILLING_OWNER_CHANGE',
  'BREAK_GLASS_ACTIVATE',
  'IMPERSONATE_USER',
]);

@Injectable()
export class AccessGovernanceService {
  constructor(private prisma: PrismaService) {}

  async dashboard(actor: CurrentUser) {
    const filter = actor.role === 'SUPER_ADMIN' ? '' : 'WHERE companyId = ?';
    const values = actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId];
    const [
      elevations,
      dualApprovals,
      relationships,
      impersonations,
      scimTokens,
      destinations,
      analytics,
      contextualPolicies,
      scimGroupMappings,
      accessRequests,
      authorizationTests,
    ] = await Promise.all([
      this.prisma.query<any[]>(
        `SELECT aer.*, u.firstName, u.lastName, u.email
         FROM AccessElevationRequest aer JOIN User u ON u.id = aer.userId
         ${actor.role === 'SUPER_ADMIN' ? '' : 'WHERE aer.companyId = ?'}
         ORDER BY aer.createdAt DESC LIMIT 100`,
        values,
      ).catch(() => []),
      this.prisma.query<any[]>(
        `SELECT * FROM DualApprovalRequest ${filter} ORDER BY createdAt DESC LIMIT 100`,
        values,
      ).catch(() => []),
      this.prisma.query<any[]>(
        `SELECT * FROM AuthorizationRelationship ${filter} ORDER BY createdAt DESC LIMIT 100`,
        values,
      ).catch(() => []),
      this.prisma.query<any[]>(
        `SELECT ims.*, a.email as actorEmail, t.email as targetEmail
         FROM ImpersonationSession ims
         JOIN User a ON a.id = ims.actorId JOIN User t ON t.id = ims.targetUserId
         ${actor.role === 'SUPER_ADMIN' ? '' : 'WHERE ims.companyId = ?'}
         ORDER BY ims.startedAt DESC LIMIT 50`,
        values,
      ).catch(() => []),
      this.listScimTokens(actor),
      this.listSecurityDestinations(actor),
      this.getPrivilegeAnalytics(actor),
      this.listContextualPolicies(actor),
      this.listScimGroupMappings(actor),
      this.listAccessRequests(actor),
      this.listAuthorizationTests(actor),
    ]);
    return {
      elevations: elevations.map((item: any) => ({ ...item, scopeValue: this.parseJson(item.scopeValue) })),
      dualApprovals: dualApprovals.map((item: any) => ({ ...item, payload: this.parseJson(item.payload) })),
      relationships,
      impersonations,
      scimTokens,
      securityDestinations: destinations,
      privilegeAnalytics: analytics,
      contextualPolicies,
      scimGroupMappings,
      accessRequests,
      authorizationTests,
      sensitiveActions: [...SENSITIVE_ACTIONS],
    };
  }

  async requestElevation(dto: any, actor: CurrentUser) {
    const user = await this.assertUserScope(dto.userId || actor.id, actor);
    const minutes = Math.min(480, Math.max(5, Number(dto.requestedMinutes || 60)));
    if (!String(dto.permissionSlug || '').trim()) throw new BadRequestException('Permission is required');
    if (!String(dto.reason || '').trim()) throw new BadRequestException('Business reason is required');
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO AccessElevationRequest
       (id, companyId, userId, permissionSlug, scopeType, scopeValue, reason, requestedMinutes, status, requestedById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, NOW(3), NOW(3))`,
      [
        id, user.companyId, user.id, dto.permissionSlug, dto.scopeType || 'ALL',
        dto.scopeValue ? JSON.stringify(dto.scopeValue) : null, String(dto.reason), minutes, actor.id,
      ],
    );
    await this.securityAlert(user.companyId, 'JIT_ELEVATION_REQUESTED', 'warning', id, `JIT access requested for ${user.email}`, { actorId: actor.id, permissionSlug: dto.permissionSlug, minutes });
    return { id, status: 'PENDING' };
  }

  async reviewElevation(id: string, decision: 'APPROVED' | 'REJECTED', actor: CurrentUser) {
    const request = await this.getScopedRow('AccessElevationRequest', id, actor);
    if (request.status !== 'PENDING') throw new BadRequestException('Elevation request is already resolved');
    if (request.requestedById === actor.id) throw new ForbiddenException('Requesters cannot approve their own elevation');
    let grantId: string | null = null;
    if (decision === 'APPROVED') {
      const permissions = await this.prisma.query<any[]>(`SELECT id FROM Permission WHERE slug = ? LIMIT 1`, [request.permissionSlug]);
      if (!permissions[0]) throw new BadRequestException('Permission no longer exists');
      grantId = crypto.randomUUID();
      await this.prisma.execute(
        `INSERT INTO TemporaryPermissionGrant
         (id, companyId, userId, permissionId, grantedById, scopeType, scopeValue, reason, startsAt, expiresAt, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), DATE_ADD(NOW(3), INTERVAL ? MINUTE), NOW(3))`,
        [grantId, request.companyId, request.userId, permissions[0].id, actor.id, request.scopeType, request.scopeValue, request.reason, request.requestedMinutes],
      );
      await this.revokeSessions([request.userId], actor.id, 'jit-elevation-approved');
    }
    await this.prisma.execute(
      `UPDATE AccessElevationRequest SET status = ?, reviewedById = ?, reviewedAt = NOW(3), grantId = ?, updatedAt = NOW(3) WHERE id = ?`,
      [decision, actor.id, grantId, id],
    );
    await this.securityAlert(request.companyId, `JIT_ELEVATION_${decision}`, decision === 'APPROVED' ? 'warning' : 'info', id, `JIT elevation ${decision.toLowerCase()}`, { actorId: actor.id, userId: request.userId, grantId });
    return { id, status: decision, grantId };
  }

  async requestDualApproval(dto: any, actor: CurrentUser) {
    const actionType = String(dto.actionType || '').toUpperCase();
    if (!SENSITIVE_ACTIONS.has(actionType)) throw new BadRequestException('Unsupported sensitive action');
    if (!String(dto.reason || '').trim()) throw new BadRequestException('Reason is required');
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.execute(
      `INSERT INTO DualApprovalRequest
       (id, companyId, actionType, resourceType, resourceId, payload, reason, status, requestedById, expiresAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, NOW(3), NOW(3))`,
      [
        id, actor.companyId, actionType, String(dto.resourceType || 'SYSTEM').toUpperCase(),
        dto.resourceId || null, JSON.stringify(dto.payload || {}), String(dto.reason), actor.id, expiresAt,
      ],
    );
    await this.securityAlert(actor.companyId, 'DUAL_APPROVAL_REQUESTED', 'critical', id, `${actionType} requires two approvers`, { actorId: actor.id, resourceId: dto.resourceId });
    return { id, status: 'PENDING', expiresAt };
  }

  async reviewDualApproval(id: string, decision: 'APPROVED' | 'REJECTED', actor: CurrentUser) {
    const request = await this.getScopedRow('DualApprovalRequest', id, actor);
    if (!['PENDING', 'FIRST_APPROVED'].includes(request.status)) throw new BadRequestException('Approval request is already resolved');
    if (new Date(request.expiresAt).getTime() <= Date.now()) throw new BadRequestException('Approval request expired');
    if (request.requestedById === actor.id) throw new ForbiddenException('Requester cannot approve this action');
    if (decision === 'REJECTED') {
      await this.prisma.execute(
        `UPDATE DualApprovalRequest SET status = 'REJECTED', rejectedById = ?, rejectedAt = NOW(3), updatedAt = NOW(3) WHERE id = ?`,
        [actor.id, id],
      );
      return { id, status: 'REJECTED' };
    }
    if (!request.firstApprovedById) {
      await this.prisma.execute(
        `UPDATE DualApprovalRequest SET status = 'FIRST_APPROVED', firstApprovedById = ?, firstApprovedAt = NOW(3), updatedAt = NOW(3) WHERE id = ?`,
        [actor.id, id],
      );
      return { id, status: 'FIRST_APPROVED' };
    }
    if (request.firstApprovedById === actor.id) throw new ForbiddenException('A different administrator must provide the second approval');
    await this.prisma.execute(
      `UPDATE DualApprovalRequest SET status = 'APPROVED', secondApprovedById = ?, secondApprovedAt = NOW(3), updatedAt = NOW(3) WHERE id = ?`,
      [actor.id, id],
    );
    await this.securityAlert(request.companyId, 'DUAL_APPROVAL_COMPLETED', 'critical', id, `${request.actionType} received two approvals`, { actorId: actor.id });
    return { id, status: 'APPROVED' };
  }

  async addRelationship(dto: any, actor: CurrentUser) {
    const subjectType = String(dto.subjectType || 'USER').toUpperCase();
    if (!['USER', 'SERVICE_ACCOUNT', 'ROLE'].includes(subjectType)) throw new BadRequestException('Invalid subject type');
    const id = crypto.randomUUID();
    const companyId = actor.role === 'SUPER_ADMIN' ? (dto.companyId || actor.companyId) : actor.companyId;
    await this.prisma.execute(
      `INSERT INTO AuthorizationRelationship
       (id, companyId, subjectType, subjectId, relationName, resourceType, resourceId, createdById, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE expiresAt = VALUES(expiresAt), companyId = VALUES(companyId)`,
      [
        id, companyId, subjectType, dto.subjectId, String(dto.relationName || 'viewer').toLowerCase(),
        String(dto.resourceType || '').toUpperCase(), dto.resourceId, actor.id, dto.expiresAt ? new Date(dto.expiresAt) : null,
      ],
    );
    return { id };
  }

  async removeRelationship(id: string, actor: CurrentUser) {
    await this.getScopedRow('AuthorizationRelationship', id, actor);
    await this.prisma.execute(`DELETE FROM AuthorizationRelationship WHERE id = ?`, [id]);
    return { id, deleted: true };
  }

  async simulatePolicy(dto: any, actor: CurrentUser) {
    const user = await this.assertUserScope(dto.userId, actor);
    const proposed = new Set<string>((dto.permissionSlugs || []).map(String));
    const checks = (dto.checks || []).map((check: any) => {
      const permissionAllowed = user.role === 'SUPER_ADMIN' || proposed.has(check.permissionSlug);
      const scopeAllowed = !check.requiredScope || check.requiredScope === 'ALL'
        || (dto.scopes || []).some((scope: any) => scope.permissionSlug === check.permissionSlug && [scope.scopeType, 'ALL'].includes(check.requiredScope));
      return { ...check, allowed: permissionAllowed && scopeAllowed, reason: !permissionAllowed ? 'MISSING_PERMISSION' : !scopeAllowed ? 'SCOPE_MISMATCH' : 'ALLOWED' };
    });
    return {
      mode: 'PROPOSED_POLICY_SIMULATION',
      user: { id: user.id, email: user.email, role: user.role },
      allowed: checks.filter((item: any) => item.allowed).length,
      denied: checks.filter((item: any) => !item.allowed).length,
      checks,
    };
  }

  async startImpersonation(dto: any, actor: CurrentUser) {
    const target = await this.assertUserScope(dto.targetUserId, actor);
    if (target.id === actor.id) throw new BadRequestException('You cannot impersonate yourself');
    const approval = await this.requireApprovedAction(dto.approvalRequestId, 'IMPERSONATE_USER', target.id, actor);
    const minutes = Math.min(30, Math.max(5, Number(dto.minutes || 15)));
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
    await this.prisma.execute(
      `INSERT INTO ImpersonationSession
       (id, companyId, actorId, targetUserId, reason, approvedRequestId, startedAt, expiresAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3), ?)`,
      [id, target.companyId, actor.id, target.id, String(dto.reason || approval.reason), approval.id, expiresAt],
    );
    await this.prisma.execute(`UPDATE DualApprovalRequest SET executedAt = NOW(3), status = 'EXECUTED' WHERE id = ?`, [approval.id]);
    await this.securityAlert(target.companyId, 'IMPERSONATION_STARTED', 'critical', id, `${actor.email} started impersonating ${target.email}`, { actorId: actor.id, targetUserId: target.id, expiresAt });
    return { id, expiresAt, target: { id: target.id, email: target.email, firstName: target.firstName, lastName: target.lastName } };
  }

  async endImpersonation(id: string, actor: CurrentUser) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM ImpersonationSession WHERE id = ? LIMIT 1`, [id]);
    const session = rows[0];
    if (!session) throw new NotFoundException('Impersonation session not found');
    if (actor.role !== 'SUPER_ADMIN' && session.actorId !== actor.id) throw new ForbiddenException();
    await this.prisma.execute(`UPDATE ImpersonationSession SET endedAt = NOW(3) WHERE id = ? AND endedAt IS NULL`, [id]);
    await this.securityAlert(session.companyId, 'IMPERSONATION_ENDED', 'info', id, 'Impersonation session ended', { actorId: actor.id });
    return { id, ended: true };
  }

  async assertApprovedAction(id: string, actionType: string, resourceId: string, actor: CurrentUser) {
    return this.requireApprovedAction(id, actionType, resourceId, actor);
  }

  async createScimToken(dto: any, actor: CurrentUser) {
    const companyId = actor.role === 'SUPER_ADMIN' ? dto.companyId : actor.companyId;
    if (!companyId) throw new BadRequestException('A company is required for SCIM');
    const token = `fsit_scim_${crypto.randomBytes(32).toString('hex')}`;
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO ScimProvisioningToken
       (id, companyId, name, tokenHash, expiresAt, isActive, createdById, createdAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, NOW(3))`,
      [id, companyId, String(dto.name || 'SCIM provisioning'), this.hash(token), dto.expiresAt ? new Date(dto.expiresAt) : null, actor.id],
    );
    return { id, token, companyId };
  }

  async revokeScimToken(id: string, actor: CurrentUser) {
    await this.getScopedRow('ScimProvisioningToken', id, actor);
    await this.prisma.execute(`UPDATE ScimProvisioningToken SET isActive = 0, revokedAt = NOW(3) WHERE id = ?`, [id]);
    return { id, revoked: true };
  }

  async listScimTokens(actor: CurrentUser) {
    const rows = await this.prisma.query<any[]>(
      `SELECT id, companyId, name, expiresAt, lastUsedAt, isActive, revokedAt, createdAt
       FROM ScimProvisioningToken ${actor.role === 'SUPER_ADMIN' ? '' : 'WHERE companyId = ?'}
       ORDER BY createdAt DESC`,
      actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId],
    ).catch(() => []);
    return rows;
  }

  async createSecurityDestination(dto: any, actor: CurrentUser) {
    this.assertWebhookUrl(dto.endpointUrl);
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO SecurityEventDestination
       (id, companyId, name, destinationType, endpointUrl, secretEncrypted, minimumSeverity, isActive, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(3), NOW(3))`,
      [
        id, actor.companyId, dto.name, String(dto.destinationType || 'WEBHOOK').toUpperCase(),
        dto.endpointUrl, dto.secret ? encryptSecret(dto.secret) : null, dto.minimumSeverity || 'info', actor.id,
      ],
    );
    return { id };
  }

  async listSecurityDestinations(actor: CurrentUser) {
    return this.prisma.query<any[]>(
      `SELECT id, companyId, name, destinationType, endpointUrl, minimumSeverity, isActive,
              lastDeliveryAt, lastDeliveryStatus, createdAt,
              CASE WHEN secretEncrypted IS NULL THEN 0 ELSE 1 END as secretConfigured
       FROM SecurityEventDestination ${actor.role === 'SUPER_ADMIN' ? '' : 'WHERE companyId = ?'}
       ORDER BY createdAt DESC`,
      actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId],
    ).catch(() => []);
  }

  async testSecurityDestination(id: string, actor: CurrentUser) {
    const destination = await this.getScopedRow('SecurityEventDestination', id, actor);
    this.assertWebhookUrl(destination.endpointUrl);
    const payload = JSON.stringify({
      eventType: 'FIELD_SERVICE_IT_SECURITY_TEST',
      severity: 'info',
      timestamp: new Date().toISOString(),
      destinationId: id,
    });
    const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'FieldserviceIT-Security-Events/1.0' };
    if (destination.secretEncrypted) {
      headers['x-fsit-signature'] = crypto.createHmac('sha256', decryptSecret(destination.secretEncrypted)).update(payload).digest('hex');
    }
    let status = 'FAILED';
    let statusCode: number | null = null;
    let errorMessage: string | null = null;
    try {
      const response = await fetch(destination.endpointUrl, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(8000) });
      statusCode = response.status;
      status = response.ok ? 'DELIVERED' : 'FAILED';
      if (!response.ok) errorMessage = `HTTP ${response.status}`;
    } catch (error: any) {
      errorMessage = String(error?.message || 'Delivery failed').slice(0, 1000);
    }
    await this.prisma.execute(
      `INSERT INTO SecurityEventDelivery (id, destinationId, status, statusCode, errorMessage, attemptedAt)
       VALUES (?, ?, ?, ?, ?, NOW(3))`,
      [crypto.randomUUID(), id, status, statusCode, errorMessage],
    );
    await this.prisma.execute(
      `UPDATE SecurityEventDestination SET lastDeliveryAt = NOW(3), lastDeliveryStatus = ?, updatedAt = NOW(3) WHERE id = ?`,
      [status, id],
    );
    return { id, status, statusCode, errorMessage };
  }

  async streamSecurityEvent(companyId: string | null, event: any) {
    const destinations = await this.prisma.query<any[]>(
      `SELECT * FROM SecurityEventDestination
       WHERE isActive = 1 AND (companyId IS NULL OR companyId = ?)`,
      [companyId],
    ).catch(() => []);
    for (const destination of destinations) {
      this.deliverSecurityEvent(destination, event).catch(() => {});
    }
  }

  async getPrivilegeAnalytics(actor: CurrentUser) {
    const companyFilter = actor.role === 'SUPER_ADMIN' ? '' : 'AND u.companyId = ?';
    const values = actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId];
    const dormantAdmins = await this.prisma.query<any[]>(
      `SELECT u.id, u.email, u.role, u.lastLoginAt
       FROM User u WHERE u.isActive = 1 AND u.deletedAt IS NULL
         AND u.role IN ('SUPER_ADMIN', 'TENANT_ADMIN')
         AND (u.lastLoginAt IS NULL OR u.lastLoginAt < DATE_SUB(NOW(3), INTERVAL 60 DAY))
         ${companyFilter} ORDER BY u.lastLoginAt`,
      values,
    ).catch(() => []);
    const unusedPermissions = await this.prisma.query<any[]>(
      `SELECT p.slug, COUNT(DISTINCT rp.roleId) as assignedRoles, MAX(pu.usedAt) as lastUsedAt
       FROM Permission p LEFT JOIN RolePermission rp ON rp.permissionId = p.id
       LEFT JOIN PermissionUsage pu ON pu.permissionSlug = p.slug
       GROUP BY p.id HAVING assignedRoles > 0 AND (lastUsedAt IS NULL OR lastUsedAt < DATE_SUB(NOW(3), INTERVAL 90 DAY))
       ORDER BY assignedRoles DESC LIMIT 50`,
    ).catch(() => []);
    const expiringServiceAccounts = await this.prisma.query<any[]>(
      `SELECT id, name, expiresAt, lastUsedAt FROM ServiceAccount
       WHERE isActive = 1 AND expiresAt IS NOT NULL AND expiresAt < DATE_ADD(NOW(3), INTERVAL 30 DAY)
       ${actor.role === 'SUPER_ADMIN' ? '' : 'AND companyId = ?'} ORDER BY expiresAt`,
      actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId],
    ).catch(() => []);
    const privilegeCreep = await this.prisma.query<any[]>(
      `SELECT u.id, u.email, u.role, COUNT(DISTINCT rp.permissionId) as permissionCount
       FROM User u LEFT JOIN UserRole ur ON ur.userId = u.id
       LEFT JOIN RolePermission rp ON rp.roleId = ur.roleId
       WHERE u.deletedAt IS NULL ${companyFilter}
       GROUP BY u.id HAVING permissionCount >= 20 ORDER BY permissionCount DESC LIMIT 50`,
      values,
    ).catch(() => []);
    const riskScores = await this.prisma.query<any[]>(
      `SELECT u.id, u.email, u.role, u.isBreakGlass, u.lastLoginAt,
              COUNT(DISTINCT rp.permissionId) as permissionCount
       FROM User u
       LEFT JOIN UserRole ur ON ur.userId = u.id
       LEFT JOIN RolePermission rp ON rp.roleId = ur.roleId
       WHERE u.isActive = 1 AND u.deletedAt IS NULL ${companyFilter}
       GROUP BY u.id ORDER BY permissionCount DESC LIMIT 100`,
      values,
    ).catch(() => []);
    const scoredUsers = riskScores.map((item: any) => {
      const dormant = !item.lastLoginAt || new Date(item.lastLoginAt).getTime() < Date.now() - 60 * 86400000;
      const score = Math.min(100,
        (item.role === 'SUPER_ADMIN' ? 45 : item.role === 'TENANT_ADMIN' ? 30 : 5)
        + Math.min(35, Number(item.permissionCount || 0))
        + (dormant ? 15 : 0)
        + (item.isBreakGlass ? 10 : 0));
      return { ...item, score, level: score >= 75 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW', dormant };
    });
    return { dormantAdmins, unusedPermissions, expiringServiceAccounts, privilegeCreep, riskScores: scoredUsers };
  }

  async exportPolicyBundle(actor: CurrentUser) {
    const companyId = actor.role === 'SUPER_ADMIN' ? null : actor.companyId;
    const values = companyId ? [companyId] : [];
    const [roles, scopes, relationships, contextualPolicies, groupMappings, tests] = await Promise.all([
      this.prisma.query<any[]>(
        `SELECT r.id, r.name, r.slug, r.description, r.companyId, r.isSystem,
                GROUP_CONCAT(p.slug ORDER BY p.slug SEPARATOR ',') as permissionSlugs
         FROM Role r LEFT JOIN RolePermission rp ON rp.roleId = r.id
         LEFT JOIN Permission p ON p.id = rp.permissionId
         ${companyId ? 'WHERE r.companyId = ? OR r.isSystem = 1' : ''}
         GROUP BY r.id ORDER BY r.name`,
        values,
      ),
      this.prisma.query<any[]>(`SELECT * FROM PermissionScope ${companyId ? 'WHERE companyId = ?' : ''}`, values),
      this.prisma.query<any[]>(`SELECT * FROM AuthorizationRelationship ${companyId ? 'WHERE companyId = ?' : ''}`, values),
      this.listContextualPolicies(actor),
      this.listScimGroupMappings(actor),
      this.listAuthorizationTests(actor),
    ]);
    const bundle = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      scope: companyId || 'PLATFORM',
      roles: roles.map((role: any) => ({ ...role, permissionSlugs: String(role.permissionSlugs || '').split(',').filter(Boolean) })),
      scopes: scopes.map((item: any) => ({ ...item, scopeValues: this.parseJson(item.scopeValues) })),
      relationships,
      contextualPolicies,
      scimGroupMappings: groupMappings,
      authorizationTests: tests,
    };
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO PolicyBundleSnapshot (id, companyId, bundle, exportedById, createdAt) VALUES (?, ?, ?, ?, NOW(3))`,
      [id, companyId, JSON.stringify(bundle), actor.id],
    );
    return { id, filename: `fieldserviceit-policy-${companyId || 'platform'}-${Date.now()}.json`, bundle };
  }

  async importPolicyBundle(body: any, actor: CurrentUser) {
    const bundle = body?.bundle || body;
    if (Number(bundle?.schemaVersion) !== 1) throw new BadRequestException('Unsupported policy bundle version');
    const companyId = actor.role === 'SUPER_ADMIN' ? (body.companyId || null) : actor.companyId;
    const snapshotId = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO PolicyBundleSnapshot (id, companyId, bundle, importedById, createdAt) VALUES (?, ?, ?, ?, NOW(3))`,
      [snapshotId, companyId, JSON.stringify(bundle), actor.id],
    );
    let imported = 0;
    for (const role of bundle.roles || []) {
      const roleRows = await this.prisma.query<any[]>(
        `SELECT id, companyId, isSystem FROM Role
         WHERE slug = ? AND (isSystem = 1 OR companyId <=> ?) LIMIT 1`,
        [role.slug, companyId],
      );
      const targetRole = roleRows[0];
      if (!targetRole || (actor.role !== 'SUPER_ADMIN' && targetRole.isSystem)) continue;
      const permissionSlugs = Array.isArray(role.permissionSlugs) ? role.permissionSlugs : [];
      await this.prisma.execute(`DELETE FROM RolePermission WHERE roleId = ?`, [targetRole.id]);
      for (const slug of permissionSlugs) {
        await this.prisma.execute(
          `INSERT IGNORE INTO RolePermission (roleId, permissionId, createdAt)
           SELECT ?, id, NOW(3) FROM Permission WHERE slug = ?`,
          [targetRole.id, slug],
        );
      }
      imported += 1;
    }
    for (const scope of bundle.scopes || []) {
      const id = crypto.randomUUID();
      await this.prisma.execute(
        `INSERT INTO PermissionScope
         (id, companyId, roleId, userId, permissionSlug, scopeType, scopeValues, createdById, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
        [id, companyId, scope.roleId || null, scope.userId || null, scope.permissionSlug, scope.scopeType || 'ALL', scope.scopeValues ? JSON.stringify(scope.scopeValues) : null, actor.id],
      ).catch(() => 0);
      imported += 1;
    }
    for (const relationship of bundle.relationships || []) {
      await this.addRelationship(relationship, actor);
      imported += 1;
    }
    for (const policy of bundle.contextualPolicies || []) {
      await this.createContextualPolicy({ ...policy, companyId }, actor);
      imported += 1;
    }
    for (const test of bundle.authorizationTests || []) {
      await this.createAuthorizationTest({ ...test, companyId }, actor);
      imported += 1;
    }
    for (const mapping of bundle.scimGroupMappings || []) {
      await this.createScimGroupMapping({ ...mapping, companyId }, actor);
      imported += 1;
    }
    await this.securityAlert(companyId, 'POLICY_BUNDLE_IMPORTED', 'warning', snapshotId, 'Policy-as-code bundle imported', { actorId: actor.id, imported });
    return { id: snapshotId, imported };
  }

  async previewPermissionImpact(dto: any, actor: CurrentUser) {
    const roleId = dto.roleId;
    const roleRows = await this.prisma.query<any[]>(`SELECT * FROM Role WHERE id = ? LIMIT 1`, [roleId]);
    const role = roleRows[0];
    if (!role) throw new NotFoundException('Role not found');
    if (actor.role !== 'SUPER_ADMIN' && role.companyId !== actor.companyId) throw new ForbiddenException();
    const proposed = new Set<string>((dto.permissionSlugs || []).map(String));
    const currentRows = await this.prisma.query<any[]>(
      `SELECT p.slug FROM RolePermission rp JOIN Permission p ON p.id = rp.permissionId WHERE rp.roleId = ?`,
      [roleId],
    );
    const current = new Set<string>(currentRows.map((item: any) => item.slug));
    const added = [...proposed].filter((slug) => !current.has(slug));
    const removed = [...current].filter((slug) => !proposed.has(slug));
    const changedPermission = added[0] || removed[0];
    const [users, services, sessions, scimManaged] = await Promise.all([
      this.prisma.query<any[]>(`SELECT COUNT(DISTINCT userId) as count FROM UserRole WHERE roleId = ?`, [roleId]),
      changedPermission
        ? this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM ServiceAccount WHERE isActive = 1 AND permissionSlugs LIKE ?`, [`%${changedPermission}%`])
        : Promise.resolve([{ count: 0 }]),
      this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM Session WHERE revokedAt IS NULL AND userId IN (SELECT userId FROM UserRole WHERE roleId = ?)`, [roleId]),
      this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM User WHERE scimManaged = 1 AND id IN (SELECT userId FROM UserRole WHERE roleId = ?)`, [roleId]),
    ]);
    return {
      role: { id: role.id, name: role.name },
      added,
      removed,
      affectedUsers: Number(users[0]?.count || 0),
      affectedServiceAccounts: Number(services[0]?.count || 0),
      activeSessions: Number(sessions[0]?.count || 0),
      scimManagedUsers: Number(scimManaged[0]?.count || 0),
      risk: removed.length ? 'HIGH' : added.some((slug) => /\.(delete|approve|manage|export)$/.test(slug)) ? 'HIGH' : 'MODERATE',
    };
  }

  async createContextualPolicy(dto: any, actor: CurrentUser) {
    const id = crypto.randomUUID();
    const companyId = actor.role === 'SUPER_ADMIN' ? (dto.companyId || null) : actor.companyId;
    await this.prisma.execute(
      `INSERT INTO ContextualAccessPolicy
       (id, companyId, name, targetType, targetValue, conditions, effect, isActive, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(3), NOW(3))`,
      [id, companyId, dto.name, dto.targetType || 'PERMISSION', dto.targetValue, JSON.stringify(dto.conditions || {}), dto.effect || 'DENY', actor.id],
    );
    return { id };
  }

  async listContextualPolicies(actor: CurrentUser) {
    const rows = await this.prisma.query<any[]>(
      `SELECT * FROM ContextualAccessPolicy ${actor.role === 'SUPER_ADMIN' ? '' : 'WHERE companyId = ?'}
       ORDER BY createdAt DESC`,
      actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId],
    ).catch(() => []);
    return rows.map((item: any) => ({ ...item, conditions: this.parseJson(item.conditions) }));
  }

  async deleteContextualPolicy(id: string, actor: CurrentUser) {
    await this.getScopedRow('ContextualAccessPolicy', id, actor);
    await this.prisma.execute(`DELETE FROM ContextualAccessPolicy WHERE id = ?`, [id]);
    return { id };
  }

  async createScimGroupMapping(dto: any, actor: CurrentUser) {
    const companyId = actor.role === 'SUPER_ADMIN' ? dto.companyId : actor.companyId;
    if (!companyId) throw new BadRequestException('Company is required');
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO ScimGroupRoleMapping
       (id, companyId, externalGroupId, externalGroupName, roleId, presetKey, priority, isActive, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE externalGroupName = VALUES(externalGroupName), roleId = VALUES(roleId),
       presetKey = VALUES(presetKey), priority = VALUES(priority), updatedAt = NOW(3)`,
      [id, companyId, dto.externalGroupId, dto.externalGroupName || null, dto.roleId || null, dto.presetKey || null, Number(dto.priority || 100), actor.id],
    );
    return { id };
  }

  async listScimGroupMappings(actor: CurrentUser) {
    return this.prisma.query<any[]>(
      `SELECT sgrm.*, r.name as roleName FROM ScimGroupRoleMapping sgrm
       LEFT JOIN Role r ON r.id = sgrm.roleId
       ${actor.role === 'SUPER_ADMIN' ? '' : 'WHERE sgrm.companyId = ?'} ORDER BY sgrm.priority, sgrm.createdAt`,
      actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId],
    ).catch(() => []);
  }

  async deleteScimGroupMapping(id: string, actor: CurrentUser) {
    await this.getScopedRow('ScimGroupRoleMapping', id, actor);
    await this.prisma.execute(`DELETE FROM ScimGroupRoleMapping WHERE id = ?`, [id]);
    return { id };
  }

  async createAccessRequest(dto: any, actor: CurrentUser) {
    const requestType = String(dto.requestType || '').toUpperCase();
    if (!['PERMISSION', 'ROLE', 'RELATIONSHIP'].includes(requestType)) throw new BadRequestException('Unsupported access request type');
    if (!String(dto.reason || '').trim()) throw new BadRequestException('A business reason is required');
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO AccessRequest
       (id, companyId, requesterId, requestType, targetId, permissionSlug, roleId,
        relationshipResourceType, relationshipResourceId, relationshipName, requestedMinutes,
        reason, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(3), NOW(3))`,
      [
        id, actor.companyId, actor.id, requestType, dto.targetId || actor.id,
        dto.permissionSlug || null, dto.roleId || null, dto.resourceType || null,
        dto.resourceId || null, dto.relationshipName || null, dto.requestedMinutes || null, dto.reason,
      ],
    );
    return { id, status: 'PENDING' };
  }

  async listAccessRequests(actor: CurrentUser) {
    return this.prisma.query<any[]>(
      `SELECT ar.*, u.email, u.firstName, u.lastName FROM AccessRequest ar
       JOIN User u ON u.id = ar.requesterId
       ${actor.role === 'SUPER_ADMIN' ? '' : 'WHERE ar.companyId = ?'}
       ORDER BY ar.createdAt DESC LIMIT 100`,
      actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId],
    ).catch(() => []);
  }

  async listMyAccessRequests(actor: CurrentUser) {
    return this.prisma.query<any[]>(
      `SELECT * FROM AccessRequest WHERE requesterId = ? ORDER BY createdAt DESC LIMIT 100`,
      [actor.id],
    ).catch(() => []);
  }

  async reviewAccessRequest(id: string, decision: 'APPROVED' | 'REJECTED', actor: CurrentUser) {
    const request = await this.getScopedRow('AccessRequest', id, actor);
    if (request.status !== 'PENDING') throw new BadRequestException('Request already reviewed');
    let resultRefId: string | null = null;
    if (decision === 'APPROVED' && request.requestType === 'PERMISSION') {
      const result = await this.requestElevation({
        userId: request.targetId || request.requesterId,
        permissionSlug: request.permissionSlug,
        requestedMinutes: request.requestedMinutes || 60,
        reason: request.reason,
      }, actor);
      resultRefId = result.id;
    }
    if (decision === 'APPROVED' && request.requestType === 'RELATIONSHIP') {
      const result = await this.addRelationship({
        subjectType: 'USER', subjectId: request.requesterId,
        relationName: request.relationshipName, resourceType: request.relationshipResourceType,
        resourceId: request.relationshipResourceId,
      }, actor);
      resultRefId = result.id;
    }
    if (decision === 'APPROVED' && request.requestType === 'ROLE' && request.roleId) {
      const roles = await this.prisma.query<any[]>(`SELECT companyId, isSystem FROM Role WHERE id = ? LIMIT 1`, [request.roleId]);
      if (!roles[0] || (actor.role !== 'SUPER_ADMIN' && roles[0].companyId !== actor.companyId && !roles[0].isSystem)) {
        throw new ForbiddenException('Requested role is outside your tenant');
      }
      await this.prisma.execute(`INSERT IGNORE INTO UserRole (userId, roleId, createdAt) VALUES (?, ?, NOW(3))`, [request.requesterId, request.roleId]);
      resultRefId = request.roleId;
      await this.revokeSessions([request.requesterId], actor.id, 'access-request-approved');
    }
    await this.prisma.execute(
      `UPDATE AccessRequest SET status = ?, reviewedById = ?, reviewedAt = NOW(3), resultRefId = ?, updatedAt = NOW(3) WHERE id = ?`,
      [decision, actor.id, resultRefId, id],
    );
    return { id, status: decision, resultRefId };
  }

  async createAuthorizationTest(dto: any, actor: CurrentUser) {
    const id = crypto.randomUUID();
    const companyId = actor.role === 'SUPER_ADMIN' ? (dto.companyId || null) : actor.companyId;
    await this.prisma.execute(
      `INSERT INTO AuthorizationTestCase
       (id, companyId, name, principalType, principalId, permissionSlug, resourceType, resourceId,
        expectedDecision, isActive, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(3), NOW(3))`,
      [id, companyId, dto.name, dto.principalType || 'ROLE', dto.principalId, dto.permissionSlug, dto.resourceType || null, dto.resourceId || null, dto.expectedDecision || 'DENY', actor.id],
    );
    return { id };
  }

  async listAuthorizationTests(actor: CurrentUser) {
    return this.prisma.query<any[]>(
      `SELECT * FROM AuthorizationTestCase ${actor.role === 'SUPER_ADMIN' ? '' : 'WHERE companyId = ?'} ORDER BY createdAt DESC`,
      actor.role === 'SUPER_ADMIN' ? [] : [actor.companyId],
    ).catch(() => []);
  }

  async runAuthorizationTests(actor: CurrentUser) {
    const tests = await this.listAuthorizationTests(actor);
    const results = [];
    for (const test of tests.filter((item: any) => item.isActive)) {
      let actual = 'DENY';
      if (test.principalType === 'ROLE') {
        const rows = await this.prisma.query<any[]>(
          `SELECT COUNT(*) as count FROM RolePermission rp JOIN Permission p ON p.id = rp.permissionId
           WHERE rp.roleId = ? AND p.slug = ?`,
          [test.principalId, test.permissionSlug],
        );
        actual = Number(rows[0]?.count || 0) > 0 ? 'ALLOW' : 'DENY';
      }
      if (test.principalType === 'USER') {
        const rows = await this.prisma.query<any[]>(
          `SELECT COUNT(*) as count FROM UserRole ur JOIN RolePermission rp ON rp.roleId = ur.roleId
           JOIN Permission p ON p.id = rp.permissionId WHERE ur.userId = ? AND p.slug = ?`,
          [test.principalId, test.permissionSlug],
        );
        actual = Number(rows[0]?.count || 0) > 0 ? 'ALLOW' : 'DENY';
      }
      results.push({ ...test, actualDecision: actual, passed: actual === test.expectedDecision });
    }
    return { passed: results.filter((item) => item.passed).length, failed: results.filter((item) => !item.passed).length, results };
  }

  async createEvidencePack(actor: CurrentUser) {
    const companyId = actor.role === 'SUPER_ADMIN' ? null : actor.companyId;
    const [reviews, alerts, approvals, elevations, impersonations, policySnapshots] = await Promise.all([
      this.prisma.query<any[]>(`SELECT * FROM AccessReviewCampaign ${companyId ? 'WHERE companyId = ?' : ''} ORDER BY createdAt DESC LIMIT 100`, companyId ? [companyId] : []),
      this.prisma.query<any[]>(`SELECT * FROM SecurityAlert ${companyId ? 'WHERE companyId = ?' : ''} ORDER BY createdAt DESC LIMIT 500`, companyId ? [companyId] : []),
      this.prisma.query<any[]>(`SELECT * FROM DualApprovalRequest ${companyId ? 'WHERE companyId = ?' : ''} ORDER BY createdAt DESC LIMIT 200`, companyId ? [companyId] : []),
      this.prisma.query<any[]>(`SELECT * FROM AccessElevationRequest ${companyId ? 'WHERE companyId = ?' : ''} ORDER BY createdAt DESC LIMIT 200`, companyId ? [companyId] : []),
      this.prisma.query<any[]>(`SELECT * FROM ImpersonationSession ${companyId ? 'WHERE companyId = ?' : ''} ORDER BY startedAt DESC LIMIT 200`, companyId ? [companyId] : []),
      this.prisma.query<any[]>(`SELECT id, companyId, createdAt FROM PolicyBundleSnapshot ${companyId ? 'WHERE companyId = ?' : ''} ORDER BY createdAt DESC LIMIT 100`, companyId ? [companyId] : []),
    ]);
    const evidence = { generatedAt: new Date().toISOString(), companyId, reviews, alerts, approvals, elevations, impersonations, policySnapshots };
    return { filename: `fieldserviceit-security-evidence-${companyId || 'platform'}-${Date.now()}.json`, mimeType: 'application/json', contentBase64: Buffer.from(JSON.stringify(evidence, null, 2)).toString('base64') };
  }

  @Cron('0 8 * * *')
  async processAccessCertificationSchedule() {
    const reminders = await this.prisma.query<any[]>(
      `SELECT id, companyId, name, dueAt, reminderDays FROM AccessReviewCampaign
       WHERE status = 'OPEN' AND dueAt IS NOT NULL
         AND dueAt <= DATE_ADD(NOW(3), INTERVAL reminderDays DAY)`,
    ).catch(() => []);
    for (const campaign of reminders) {
      await this.securityAlert(campaign.companyId, 'ACCESS_REVIEW_DUE', 'warning', campaign.id, `${campaign.name} access review is due soon`, { dueAt: campaign.dueAt });
    }

    const recurring = await this.prisma.query<any[]>(
      `SELECT * FROM AccessReviewCampaign
       WHERE status = 'COMPLETED' AND cadence IN ('MONTHLY', 'QUARTERLY')
         AND nextRunAt IS NOT NULL AND nextRunAt <= NOW(3)`,
    ).catch(() => []);
    for (const source of recurring) {
      const id = crypto.randomUUID();
      const intervalMonths = source.cadence === 'MONTHLY' ? 1 : 3;
      await this.prisma.execute(
        `INSERT INTO AccessReviewCampaign
         (id, companyId, name, status, dueAt, cadence, reminderDays, nextRunAt, createdById, createdAt, updatedAt)
         VALUES (?, ?, ?, 'OPEN', DATE_ADD(NOW(3), INTERVAL 14 DAY), ?, ?, NULL, ?, NOW(3), NOW(3))`,
        [id, source.companyId, source.name, source.cadence, source.reminderDays, source.createdById],
      );
      const users = await this.prisma.query<any[]>(
        `SELECT id FROM User WHERE isActive = 1 AND deletedAt IS NULL ${source.companyId ? 'AND companyId = ?' : ''}`,
        source.companyId ? [source.companyId] : [],
      );
      for (const user of users) {
        await this.prisma.execute(
          `INSERT IGNORE INTO AccessReviewItem (id, campaignId, userId, decision, createdAt, updatedAt)
           VALUES (?, ?, ?, 'PENDING', NOW(3), NOW(3))`,
          [crypto.randomUUID(), id, user.id],
        );
      }
      await this.prisma.execute(
        `UPDATE AccessReviewCampaign SET nextRunAt = DATE_ADD(nextRunAt, INTERVAL ? MONTH), updatedAt = NOW(3) WHERE id = ?`,
        [intervalMonths, source.id],
      );
    }
  }

  private async getScopedRow(table: string, id: string, actor: CurrentUser) {
    const allowed = new Set(['AccessElevationRequest', 'DualApprovalRequest', 'AuthorizationRelationship', 'ScimProvisioningToken', 'SecurityEventDestination', 'ContextualAccessPolicy', 'ScimGroupRoleMapping', 'AccessRequest']);
    if (!allowed.has(table)) throw new BadRequestException();
    const rows = await this.prisma.query<any[]>(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) throw new NotFoundException('Governance record not found');
    if (actor.role !== 'SUPER_ADMIN' && row.companyId !== actor.companyId) throw new ForbiddenException('Record is outside your tenant');
    return row;
  }

  private async assertUserScope(userId: string, actor: CurrentUser) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');
    if (actor.role !== 'SUPER_ADMIN' && user.companyId !== actor.companyId) throw new ForbiddenException('User is outside your tenant');
    return user;
  }

  private async requireApprovedAction(id: string, actionType: string, resourceId: string, actor: CurrentUser) {
    if (!id) throw new BadRequestException('An approved two-person request is required');
    const request = await this.getScopedRow('DualApprovalRequest', id, actor);
    if (request.status !== 'APPROVED' || request.actionType !== actionType || String(request.resourceId || '') !== String(resourceId || '')) {
      throw new BadRequestException('Approval does not authorize this action');
    }
    return request;
  }

  private async revokeSessions(userIds: string[], actorId: string, reason: string) {
    await this.prisma.execute(
      `UPDATE Session SET revokedAt = NOW(3), revokedById = ?, revokeReason = ?
       WHERE revokedAt IS NULL AND userId IN (${userIds.map(() => '?').join(',')})`,
      [actorId, reason, ...userIds],
    ).catch(() => {});
    await this.prisma.execute(
      `UPDATE User SET authVersion = authVersion + 1 WHERE id IN (${userIds.map(() => '?').join(',')})`,
      userIds,
    ).catch(() => {});
  }

  private async securityAlert(companyId: string | null, alertType: string, severity: string, subjectId: string, summary: string, detail: any) {
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO SecurityAlert (id, companyId, alertType, severity, subjectId, summary, detail, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [id, companyId, alertType, severity, subjectId, summary.slice(0, 255), JSON.stringify(detail)],
    ).catch(() => {});
    await this.streamSecurityEvent(companyId, { id, alertType, severity, subjectId, summary, detail, createdAt: new Date().toISOString() });
  }

  private async deliverSecurityEvent(destination: any, event: any) {
    this.assertWebhookUrl(destination.endpointUrl);
    const payload = JSON.stringify(event);
    const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'FieldserviceIT-Security-Events/1.0' };
    if (destination.secretEncrypted) {
      headers['x-fsit-signature'] = crypto.createHmac('sha256', decryptSecret(destination.secretEncrypted)).update(payload).digest('hex');
    }
    let status = 'FAILED';
    let statusCode: number | null = null;
    let errorMessage: string | null = null;
    try {
      const response = await fetch(destination.endpointUrl, { method: 'POST', headers, body: payload, signal: AbortSignal.timeout(8000) });
      statusCode = response.status;
      status = response.ok ? 'DELIVERED' : 'FAILED';
      if (!response.ok) errorMessage = `HTTP ${response.status}`;
    } catch (error: any) {
      errorMessage = String(error?.message || 'Delivery failed').slice(0, 1000);
    }
    await this.prisma.execute(
      `INSERT INTO SecurityEventDelivery (id, destinationId, alertId, status, statusCode, errorMessage, attemptedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
      [crypto.randomUUID(), destination.id, event.id || null, status, statusCode, errorMessage],
    ).catch(() => {});
    await this.prisma.execute(
      `UPDATE SecurityEventDestination SET lastDeliveryAt = NOW(3), lastDeliveryStatus = ?, updatedAt = NOW(3) WHERE id = ?`,
      [status, destination.id],
    ).catch(() => {});
  }

  private assertWebhookUrl(value: string) {
    let url: URL;
    try { url = new URL(value); } catch { throw new BadRequestException('A valid webhook URL is required'); }
    if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new BadRequestException('Webhook URL must use HTTPS');
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
      throw new BadRequestException('Private network webhook destinations are not allowed');
    }
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private parseJson(value?: string | null) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return value; }
  }
}
