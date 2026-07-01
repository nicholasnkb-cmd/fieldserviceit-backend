import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';

const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group';

@Injectable()
export class ScimService {
  constructor(private prisma: PrismaService) {}

  async listUsers(companyId: string, query: any) {
    const startIndex = Math.max(1, Number(query.startIndex || 1));
    const count = Math.min(200, Math.max(1, Number(query.count || 100)));
    const values: any[] = [companyId];
    let where = 'companyId = ? AND deletedAt IS NULL';
    const filter = String(query.filter || '');
    const match = filter.match(/^(userName|externalId)\s+eq\s+"([^"]+)"$/i);
    if (match) {
      where += match[1].toLowerCase() === 'username' ? ' AND email = ?' : ' AND scimExternalId = ?';
      values.push(match[2]);
    }
    const total = await this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM User WHERE ${where}`, values);
    const users = await this.prisma.query<any[]>(
      `SELECT * FROM User WHERE ${where} ORDER BY createdAt LIMIT ? OFFSET ?`,
      [...values, count, startIndex - 1],
    );
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: Number(total[0]?.count || 0),
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map((user) => this.toScim(user)),
    };
  }

  async getUser(companyId: string, id: string) {
    const user = await this.findUser(companyId, id);
    return this.toScim(user);
  }

  async createUser(companyId: string, body: any) {
    const email = String(body.userName || body.emails?.[0]?.value || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('userName is required');
    const existing = await this.prisma.query<any[]>(`SELECT id FROM User WHERE email = ? LIMIT 1`, [email]);
    if (existing[0]) throw new BadRequestException('User already exists');
    const id = crypto.randomUUID();
    const firstName = String(body.name?.givenName || body.displayName || email.split('@')[0]).slice(0, 100);
    const lastName = String(body.name?.familyName || 'User').slice(0, 100);
    await this.prisma.execute(
      `INSERT INTO User
       (id, email, firstName, lastName, role, userType, companyId, isActive, emailVerified,
        scimExternalId, scimManaged, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'BUSINESS', ?, ?, 1, ?, 1, NOW(3), NOW(3))`,
      [id, email, firstName, lastName, this.mapRole(body.roles), companyId, body.active === false ? 0 : 1, body.externalId || null],
    );
    return this.getUser(companyId, id);
  }

  async replaceUser(companyId: string, id: string, body: any) {
    await this.findUser(companyId, id);
    const email = String(body.userName || body.emails?.[0]?.value || '').trim().toLowerCase();
    if (!email) throw new BadRequestException('userName is required');
    await this.prisma.execute(
      `UPDATE User SET email = ?, firstName = ?, lastName = ?, role = ?, isActive = ?,
       scimExternalId = ?, scimManaged = 1, authVersion = authVersion + 1, updatedAt = NOW(3) WHERE id = ? AND companyId = ?`,
      [
        email, body.name?.givenName || body.displayName || email.split('@')[0], body.name?.familyName || 'User',
        this.mapRole(body.roles), body.active === false ? 0 : 1, body.externalId || null, id, companyId,
      ],
    );
    await this.revokeSessions(id);
    return this.getUser(companyId, id);
  }

  async patchUser(companyId: string, id: string, body: any) {
    const current = await this.findUser(companyId, id);
    const next: any = {
      userName: current.email,
      active: Boolean(current.isActive),
      externalId: current.scimExternalId,
      name: { givenName: current.firstName, familyName: current.lastName },
      roles: [{ value: current.role }],
    };
    for (const operation of body.Operations || body.operations || []) {
      if (String(operation.op).toLowerCase() === 'remove') {
        if (String(operation.path).toLowerCase() === 'externalid') next.externalId = null;
        continue;
      }
      const path = String(operation.path || '').toLowerCase();
      if (!path && typeof operation.value === 'object') Object.assign(next, operation.value);
      else if (path === 'active') next.active = Boolean(operation.value);
      else if (path === 'username') next.userName = operation.value;
      else if (path === 'externalid') next.externalId = operation.value;
      else if (path === 'name.givenname') next.name.givenName = operation.value;
      else if (path === 'name.familyname') next.name.familyName = operation.value;
      else if (path === 'roles') next.roles = operation.value;
    }
    return this.replaceUser(companyId, id, next);
  }

  async deleteUser(companyId: string, id: string) {
    await this.findUser(companyId, id);
    await this.prisma.execute(
      `UPDATE User SET isActive = 0, deletedAt = NOW(3), authVersion = authVersion + 1, updatedAt = NOW(3)
       WHERE id = ? AND companyId = ?`,
      [id, companyId],
    );
    await this.revokeSessions(id);
    return { deleted: true };
  }

  async listGroups(companyId: string, query: any) {
    const startIndex = Math.max(1, Number(query.startIndex || 1));
    const count = Math.min(200, Math.max(1, Number(query.count || 100)));
    const total = await this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM ScimGroup WHERE companyId = ?`, [companyId]);
    const groups = await this.prisma.query<any[]>(`SELECT * FROM ScimGroup WHERE companyId = ? ORDER BY displayName LIMIT ? OFFSET ?`, [companyId, count, startIndex - 1]);
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: Number(total[0]?.count || 0),
      startIndex,
      itemsPerPage: groups.length,
      Resources: await Promise.all(groups.map((group) => this.toScimGroup(companyId, group))),
    };
  }

  async getGroup(companyId: string, id: string) {
    return this.toScimGroup(companyId, await this.findGroup(companyId, id));
  }

  async createGroup(companyId: string, body: any) {
    const id = crypto.randomUUID();
    const displayName = String(body.displayName || '').trim();
    if (!displayName) throw new BadRequestException('displayName is required');
    await this.prisma.execute(
      `INSERT INTO ScimGroup (id, companyId, externalId, displayName, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NOW(3), NOW(3))`,
      [id, companyId, body.externalId || id, displayName],
    );
    await this.replaceGroupMembers(companyId, id, body.members || []);
    return this.getGroup(companyId, id);
  }

  async replaceGroup(companyId: string, id: string, body: any) {
    await this.findGroup(companyId, id);
    const displayName = String(body.displayName || '').trim();
    if (!displayName) throw new BadRequestException('displayName is required');
    await this.prisma.execute(`UPDATE ScimGroup SET externalId = ?, displayName = ?, updatedAt = NOW(3) WHERE id = ? AND companyId = ?`, [body.externalId || id, displayName, id, companyId]);
    await this.replaceGroupMembers(companyId, id, body.members || []);
    return this.getGroup(companyId, id);
  }

  async patchGroup(companyId: string, id: string, body: any) {
    const group = await this.findGroup(companyId, id);
    let displayName = group.displayName;
    let members: any[] | null = null;
    for (const operation of body.Operations || body.operations || []) {
      const op = String(operation.op || '').toLowerCase();
      const path = String(operation.path || '').toLowerCase();
      if (op === 'replace' && path === 'displayname') displayName = String(operation.value || '').trim();
      if (op === 'replace' && (!path || path === 'members')) members = Array.isArray(operation.value) ? operation.value : [];
      if (op === 'add' && (!path || path === 'members')) members = [...await this.listGroupMemberRefs(id), ...(Array.isArray(operation.value) ? operation.value : [])];
      if (op === 'remove' && path.startsWith('members')) members = [];
    }
    await this.prisma.execute(`UPDATE ScimGroup SET displayName = ?, updatedAt = NOW(3) WHERE id = ? AND companyId = ?`, [displayName, id, companyId]);
    if (members) await this.replaceGroupMembers(companyId, id, members);
    return this.getGroup(companyId, id);
  }

  async deleteGroup(companyId: string, id: string) {
    await this.findGroup(companyId, id);
    await this.prisma.execute(`DELETE FROM ScimGroupMember WHERE groupId = ?`, [id]);
    await this.prisma.execute(`DELETE FROM ScimGroup WHERE id = ? AND companyId = ?`, [id, companyId]);
    return { deleted: true };
  }

  serviceProviderConfig() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Bearer Token', description: 'Tenant-scoped SCIM bearer token', primary: true }],
    };
  }

  private async findUser(companyId: string, id: string) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM User WHERE id = ? AND companyId = ? AND deletedAt IS NULL LIMIT 1`, [id, companyId]);
    if (!rows[0]) throw new NotFoundException('SCIM user not found');
    return rows[0];
  }

  private async findGroup(companyId: string, id: string) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM ScimGroup WHERE id = ? AND companyId = ? LIMIT 1`, [id, companyId]);
    if (!rows[0]) throw new NotFoundException('SCIM group not found');
    return rows[0];
  }

  private async replaceGroupMembers(companyId: string, groupId: string, members: any[]) {
    await this.prisma.execute(`DELETE FROM ScimGroupMember WHERE groupId = ?`, [groupId]);
    const userIds = [...new Set<string>((members || []).map((member: any) => String(member.value || member.$ref || '').split('/').pop() || '').filter(Boolean))];
    for (const userId of userIds) {
      const user = await this.prisma.query<any[]>(`SELECT id FROM User WHERE id = ? AND companyId = ? AND deletedAt IS NULL LIMIT 1`, [userId, companyId]);
      if (user[0]) await this.prisma.execute(`INSERT IGNORE INTO ScimGroupMember (groupId, userId, createdAt) VALUES (?, ?, NOW(3))`, [groupId, userId]);
    }
    await this.applyGroupMappings(companyId, groupId, userIds);
  }

  private async applyGroupMappings(companyId: string, groupId: string, userIds: string[]) {
    const mappings = await this.prisma.query<any[]>(
      `SELECT roleId FROM ScimGroupRoleMapping
       WHERE companyId = ? AND isActive = 1
         AND externalGroupId IN (?, (SELECT externalId FROM ScimGroup WHERE id = ?))
         AND roleId IS NOT NULL ORDER BY priority`,
      [companyId, groupId, groupId],
    ).catch(() => []);
    for (const userId of userIds) {
      for (const mapping of mappings) {
        await this.prisma.execute(`INSERT IGNORE INTO UserRole (userId, roleId, createdAt) VALUES (?, ?, NOW(3))`, [userId, mapping.roleId]);
      }
      if (mappings.length) {
        await this.prisma.execute(`UPDATE User SET authVersion = authVersion + 1 WHERE id = ?`, [userId]);
        await this.revokeSessions(userId);
      }
    }
  }

  private async listGroupMemberRefs(groupId: string) {
    return this.prisma.query<any[]>(`SELECT userId as value FROM ScimGroupMember WHERE groupId = ?`, [groupId]).catch(() => []);
  }

  private mapRole(roles: any) {
    const requested = String(Array.isArray(roles) ? roles[0]?.value || roles[0] : roles || 'CLIENT').toUpperCase().replace(/[\s-]+/g, '_');
    return ['TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY'].includes(requested) ? requested : 'CLIENT';
  }

  private toScim(user: any) {
    return {
      schemas: [USER_SCHEMA],
      id: user.id,
      externalId: user.scimExternalId || undefined,
      userName: user.email,
      active: Boolean(user.isActive),
      displayName: `${user.firstName} ${user.lastName}`.trim(),
      name: { givenName: user.firstName, familyName: user.lastName },
      emails: [{ value: user.email, type: 'work', primary: true }],
      roles: [{ value: user.role, primary: true }],
      meta: { resourceType: 'User', created: user.createdAt, lastModified: user.updatedAt, location: `/v1/scim/v2/Users/${user.id}` },
    };
  }

  private async toScimGroup(companyId: string, group: any) {
    const members = await this.prisma.query<any[]>(
      `SELECT u.id, u.email FROM ScimGroupMember gm JOIN User u ON u.id = gm.userId
       WHERE gm.groupId = ? AND u.companyId = ?`,
      [group.id, companyId],
    ).catch(() => []);
    return {
      schemas: [GROUP_SCHEMA],
      id: group.id,
      externalId: group.externalId || undefined,
      displayName: group.displayName,
      members: members.map((member) => ({ value: member.id, display: member.email, $ref: `/v1/scim/v2/Users/${member.id}` })),
      meta: { resourceType: 'Group', created: group.createdAt, lastModified: group.updatedAt, location: `/v1/scim/v2/Groups/${group.id}` },
    };
  }

  private async revokeSessions(userId: string) {
    await this.prisma.execute(`UPDATE Session SET revokedAt = NOW(3), revokeReason = 'scim-user-change' WHERE userId = ? AND revokedAt IS NULL`, [userId]).catch(() => {});
  }
}
