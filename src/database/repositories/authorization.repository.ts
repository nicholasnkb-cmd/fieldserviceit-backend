import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface EffectiveRolePermission {
  roleId: string;
  slug: string;
}

@Injectable()
export class AuthorizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserRolePermissions(userId: string): Promise<EffectiveRolePermission[]> {
    return this.prisma.query<EffectiveRolePermission[]>(
      `SELECT r.id as roleId, p.slug
       FROM UserRole ur
       JOIN Role r ON r.id = ur.roleId
       JOIN RolePermission rp ON rp.roleId = r.id
       JOIN Permission p ON p.id = rp.permissionId
       WHERE ur.userId = ?
       ORDER BY p.slug`,
      [userId],
    );
  }

  async findSystemRolePermissions(role: string): Promise<EffectiveRolePermission[]> {
    return this.prisma.query<EffectiveRolePermission[]>(
      `SELECT r.id as roleId, p.slug
       FROM Role r
       JOIN RolePermission rp ON rp.roleId = r.id
       JOIN Permission p ON p.id = rp.permissionId
       WHERE r.isSystem = 1 AND (r.name = ? OR r.slug = ?)
       ORDER BY p.slug`,
      [role, String(role || '').toLowerCase().replace(/_/g, '-')],
    );
  }
}
