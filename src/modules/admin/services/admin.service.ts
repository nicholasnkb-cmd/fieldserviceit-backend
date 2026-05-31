import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const BCRYPT_ROUNDS = 12;
const VALID_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY'];
const FEATURE_KEYS = ['tickets', 'dispatch', 'assets', 'network', 'rmmIntegration', 'aiAgent', 'reporting', 'workflows', 'billing', 'settings', 'auditLogs'];

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auditLogService: AuditLogService,
  ) {}

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
    maxUsers?: number;
    maxTickets?: number;
    stripePriceId?: string;
    isActive?: boolean;
    features?: Record<string, boolean>;
  }) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');

    const data: any = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.monthlyPrice !== undefined) data.monthlyPrice = Number(dto.monthlyPrice);
    if (dto.maxUsers !== undefined) data.maxUsers = Number(dto.maxUsers);
    if (dto.maxTickets !== undefined) data.maxTickets = Number(dto.maxTickets);
    if (dto.stripePriceId !== undefined) data.stripePriceId = dto.stripePriceId || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.features !== undefined) data.features = JSON.stringify(dto.features);

    return this.prisma.plan.update({ where: { id }, data });
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

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
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

  async createCompanyUser(dto: { email: string; password: string; firstName: string; lastName: string; role?: string }, companyId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email already in use');

    const role = dto.role && ['CLIENT', 'TECHNICIAN', 'TENANT_ADMIN', 'READ_ONLY'].includes(dto.role) ? dto.role : 'CLIENT';
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

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
    const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
    const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);

    add('Stripe secret key', stripeConfigured, stripeConfigured ? 'STRIPE_SECRET_KEY is configured.' : 'Set STRIPE_SECRET_KEY before taking paid signups.', 'critical');
    add('Stripe webhook', webhookConfigured, webhookConfigured ? 'STRIPE_WEBHOOK_SECRET is configured.' : 'Configure Stripe webhook endpoint /v1/billing/webhook.', 'critical');
    add('Business plan price', Boolean(businessPlan?.stripePriceId), businessPlan?.stripePriceId ? 'Business plan has a Stripe price ID.' : 'Add a Stripe price ID to the Business plan.', 'warning');
    add('Starter plan price', Boolean(starterPlan?.stripePriceId), starterPlan?.stripePriceId ? 'Starter plan has a Stripe price ID.' : 'Add a Stripe price ID to the individual Starter plan.', 'warning');
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
      stripeWebhookPath: '/v1/billing/webhook',
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
        stripePriceConfigured: Boolean(plan.stripePriceId),
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
