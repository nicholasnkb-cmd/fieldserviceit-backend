import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const VALID_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY'];

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ── Permissions ──

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { name: 'asc' }] });
  }

  // ── System Roles (all companies) ──

  async listRoles(companyId?: string) {
    const where: any = {};
    if (companyId) {
      where.OR = [{ companyId }, { isSystem: true }];
    }
    return this.prisma.role.findMany({
      where,
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { userRoles: true } },
      },
      orderBy: { name: 'asc' },
    });
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
    return role;
  }

  async createRole(dto: { name: string; slug: string; description?: string; companyId?: string; permissionSlugs?: string[] }) {
    const existing = await this.prisma.role.findUnique({
      where: { slug_companyId: { slug: dto.slug, companyId: dto.companyId || '' } },
    });
    if (existing) throw new BadRequestException('Role slug already exists for this company');

    return this.prisma.role.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        companyId: dto.companyId || null,
        permissions: dto.permissionSlugs?.length
          ? {
              create: dto.permissionSlugs.map((slug) => ({
                permission: { connect: { slug } },
              })),
            }
          : undefined,
      },
      include: {
        permissions: { include: { permission: true } },
      },
    });
  }

  async updateRole(roleId: string, dto: { name?: string; description?: string; permissionSlugs?: string[] }) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;

    if (dto.permissionSlugs) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId } });
      if (dto.permissionSlugs.length > 0) {
        const perms = await this.prisma.permission.findMany({
          where: { slug: { in: dto.permissionSlugs } },
        });
        await this.prisma.rolePermission.createMany({
          data: perms.map((p) => ({ roleId, permissionId: p.id })),
        });
      }
    }

    return this.prisma.role.update({
      where: { id: roleId },
      data: updateData,
      include: {
        permissions: { include: { permission: true } },
      },
    });
  }

  async deleteRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('Cannot delete system roles');

    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    await this.prisma.userRole.deleteMany({ where: { roleId } });
    return this.prisma.role.delete({ where: { id: roleId } });
  }

  // ── User-Role assignments ──

  async assignUserRole(userId: string, roleId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    if (role.companyId && role.companyId !== user.companyId) {
      throw new BadRequestException('Role does not belong to the user\'s company');
    }

    return this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
      include: { role: true },
    });
  }

  async removeUserRole(userId: string, roleId: string) {
    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });
    if (!existing) throw new NotFoundException('User-role assignment not found');
    return this.prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
  }

  async getUserRoles(userId: string) {
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
      TENANT_ADMIN: 'Administrator for a single company/tenant',
      TECHNICIAN: 'Field service technician with dispatch access',
      CLIENT: 'Standard end user',
      READ_ONLY: 'View-only access',
    };
    return descriptions[role] || '';
  }

  async listUsers(query: { page?: number; limit?: number; search?: string; role?: string; userType?: string }) {
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

  async createUser(dto: { email: string; password: string; firstName: string; lastName: string; role?: string; companyId: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already in use');

    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new BadRequestException('Company not found');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role = dto.role && VALID_ROLES.includes(dto.role) ? dto.role : 'CLIENT';

    return this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role,
        userType: 'BUSINESS',
        companyId: dto.companyId,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true },
    });
  }

  async updateUserRole(userId: string, role: string) {
    if (!VALID_ROLES.includes(role)) {
      throw new BadRequestException('Invalid role');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
  }

  async updateUser(id: string, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updateData: any = {};
    if (dto.firstName) updateData.firstName = dto.firstName;
    if (dto.lastName) updateData.lastName = dto.lastName;
    if (dto.role && VALID_ROLES.includes(dto.role)) updateData.role = dto.role;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
      if (!company) throw new BadRequestException('Company not found');
      updateData.companyId = dto.companyId;
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, companyId: true },
    });
  }

  async removeUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true, email: true },
    });
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

  async updateCompany(id: string, dto: any) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');

    return this.prisma.company.update({
      where: { id },
      data: dto,
    });
  }

  async removeCompany(id: string) {
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

  async updateCompanyUserRole(userId: string, role: string, companyId: string) {
    const tenantRoles = ['TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY'];
    if (!tenantRoles.includes(role)) {
      throw new BadRequestException('Invalid role for tenant admin');
    }

    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found in your company');

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
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

  async createCompanyUser(dto: { email: string; password: string; firstName: string; lastName: string; role?: string }, companyId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already in use');

    const role = dto.role && ['CLIENT', 'TECHNICIAN', 'TENANT_ADMIN', 'READ_ONLY'].includes(dto.role) ? dto.role : 'CLIENT';
    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        email: dto.email, passwordHash, firstName: dto.firstName, lastName: dto.lastName,
        role, userType: 'BUSINESS', companyId,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
  }

  async removeCompanyUser(userId: string, companyId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) throw new NotFoundException('User not found in your company');

    return this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date(), isActive: false },
      select: { id: true, email: true },
    });
  }

  async listAuditLogs(query: { page?: number; limit?: number; companyId?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.companyId) where.companyId = query.companyId;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
          company: { select: { id: true, name: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
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
