"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const VALID_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY'];
let AdminService = class AdminService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listPermissions() {
        return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { name: 'asc' }] });
    }
    async listRoles(companyId) {
        const where = {};
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
    async getRole(roleId) {
        const role = await this.prisma.role.findUnique({
            where: { id: roleId },
            include: {
                permissions: {
                    include: { permission: true },
                },
                _count: { select: { userRoles: true } },
            },
        });
        if (!role)
            throw new common_1.NotFoundException('Role not found');
        return role;
    }
    async createRole(dto) {
        const existing = await this.prisma.role.findUnique({
            where: { slug_companyId: { slug: dto.slug, companyId: dto.companyId || '' } },
        });
        if (existing)
            throw new common_1.BadRequestException('Role slug already exists for this company');
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
    async updateRole(roleId, dto) {
        const role = await this.prisma.role.findUnique({ where: { id: roleId } });
        if (!role)
            throw new common_1.NotFoundException('Role not found');
        const updateData = {};
        if (dto.name)
            updateData.name = dto.name;
        if (dto.description !== undefined)
            updateData.description = dto.description;
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
    async deleteRole(roleId) {
        const role = await this.prisma.role.findUnique({ where: { id: roleId } });
        if (!role)
            throw new common_1.NotFoundException('Role not found');
        if (role.isSystem)
            throw new common_1.BadRequestException('Cannot delete system roles');
        await this.prisma.rolePermission.deleteMany({ where: { roleId } });
        await this.prisma.userRole.deleteMany({ where: { roleId } });
        return this.prisma.role.delete({ where: { id: roleId } });
    }
    async assignUserRole(userId, roleId) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const role = await this.prisma.role.findUnique({ where: { id: roleId } });
        if (!role)
            throw new common_1.NotFoundException('Role not found');
        if (role.companyId && role.companyId !== user.companyId) {
            throw new common_1.BadRequestException('Role does not belong to the user\'s company');
        }
        return this.prisma.userRole.upsert({
            where: { userId_roleId: { userId, roleId } },
            update: {},
            create: { userId, roleId },
            include: { role: true },
        });
    }
    async removeUserRole(userId, roleId) {
        const existing = await this.prisma.userRole.findUnique({
            where: { userId_roleId: { userId, roleId } },
        });
        if (!existing)
            throw new common_1.NotFoundException('User-role assignment not found');
        return this.prisma.userRole.delete({ where: { userId_roleId: { userId, roleId } } });
    }
    async getUserRoles(userId) {
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
    listRolesLegacy() {
        return VALID_ROLES.map((role, index) => ({
            id: index + 1,
            name: role,
            description: this.getRoleDescription(role),
        }));
    }
    getRoleDescription(role) {
        const descriptions = {
            SUPER_ADMIN: 'Full system access across all tenants',
            TENANT_ADMIN: 'Administrator for a single company/tenant',
            TECHNICIAN: 'Field service technician with dispatch access',
            CLIENT: 'Standard end user',
            READ_ONLY: 'View-only access',
        };
        return descriptions[role] || '';
    }
    async listUsers(query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const skip = (page - 1) * limit;
        const where = { deletedAt: null };
        if (query.search) {
            where.OR = [
                { email: { contains: query.search } },
                { firstName: { contains: query.search } },
                { lastName: { contains: query.search } },
            ];
        }
        if (query.role)
            where.role = query.role;
        if (query.userType)
            where.userType = query.userType;
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
    async getUser(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true, email: true, firstName: true, lastName: true, role: true, userType: true,
                companyId: true, company: { select: { id: true, name: true } },
                isActive: true, emailVerified: true, phone: true, lastLoginAt: true, createdAt: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    async createUser(dto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing)
            throw new common_1.BadRequestException('Email already in use');
        const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
        if (!company)
            throw new common_1.BadRequestException('Company not found');
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
    async updateUserRole(userId, role) {
        if (!VALID_ROLES.includes(role)) {
            throw new common_1.BadRequestException('Invalid role');
        }
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return this.prisma.user.update({
            where: { id: userId },
            data: { role },
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
        });
    }
    async updateUser(id, dto) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const updateData = {};
        if (dto.firstName)
            updateData.firstName = dto.firstName;
        if (dto.lastName)
            updateData.lastName = dto.lastName;
        if (dto.role && VALID_ROLES.includes(dto.role))
            updateData.role = dto.role;
        if (dto.isActive !== undefined)
            updateData.isActive = dto.isActive;
        if (dto.companyId) {
            const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
            if (!company)
                throw new common_1.BadRequestException('Company not found');
            updateData.companyId = dto.companyId;
        }
        return this.prisma.user.update({
            where: { id },
            data: updateData,
            select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, companyId: true },
        });
    }
    async removeUser(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return this.prisma.user.update({
            where: { id },
            data: { deletedAt: new Date(), isActive: false },
            select: { id: true, email: true },
        });
    }
    async listCompanies(query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const skip = (page - 1) * limit;
        const where = { deletedAt: null };
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
    async createCompany(dto) {
        const existing = await this.prisma.company.findUnique({ where: { slug: dto.slug } });
        if (existing)
            throw new common_1.BadRequestException('Company slug already exists');
        return this.prisma.company.create({
            data: {
                name: dto.name,
                slug: dto.slug,
                domain: dto.domain,
                settings: JSON.stringify({ timezone: 'UTC', locale: 'en-US' }),
            },
        });
    }
    async updateCompany(id, dto) {
        const company = await this.prisma.company.findUnique({ where: { id } });
        if (!company)
            throw new common_1.NotFoundException('Company not found');
        return this.prisma.company.update({
            where: { id },
            data: dto,
        });
    }
    async removeCompany(id) {
        const company = await this.prisma.company.findUnique({ where: { id } });
        if (!company)
            throw new common_1.NotFoundException('Company not found');
        await this.prisma.user.updateMany({
            where: { companyId: id },
            data: { deletedAt: new Date(), isActive: false },
        });
        return this.prisma.company.update({
            where: { id },
            data: { deletedAt: new Date(), isActive: false },
        });
    }
    async generateInviteCode(companyId, expiresInDays = 30) {
        const company = await this.prisma.company.findUnique({ where: { id: companyId } });
        if (!company)
            throw new common_1.NotFoundException('Company not found');
        const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        const inviteExpiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
        return this.prisma.company.update({
            where: { id: companyId },
            data: { inviteCode, inviteExpiresAt },
            select: { id: true, name: true, inviteCode: true, inviteExpiresAt: true },
        });
    }
    async listCompanyUsers(companyId, query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const skip = (page - 1) * limit;
        const where = { companyId, deletedAt: null };
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
    async updateCompanyUserRole(userId, role, companyId) {
        const tenantRoles = ['TENANT_ADMIN', 'TECHNICIAN', 'CLIENT', 'READ_ONLY'];
        if (!tenantRoles.includes(role)) {
            throw new common_1.BadRequestException('Invalid role for tenant admin');
        }
        const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
        if (!user)
            throw new common_1.NotFoundException('User not found in your company');
        return this.prisma.user.update({
            where: { id: userId },
            data: { role },
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
        });
    }
    async getCompanyUser(userId, companyId) {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, companyId },
            select: {
                id: true, email: true, firstName: true, lastName: true, role: true, userType: true,
                isActive: true, emailVerified: true, phone: true, lastLoginAt: true, createdAt: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found in your company');
        return user;
    }
    async getCompanySettings(companyId) {
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, name: true, slug: true, domain: true, logo: true, branding: true, settings: true, inviteCode: true, inviteExpiresAt: true },
        });
        if (!company)
            throw new common_1.NotFoundException('Company not found');
        return {
            ...company,
            settings: company.settings ? JSON.parse(company.settings) : {},
            branding: company.branding ? JSON.parse(company.branding) : {},
        };
    }
    async updateCompanySettings(companyId, dto) {
        const company = await this.prisma.company.findUnique({ where: { id: companyId } });
        if (!company)
            throw new common_1.NotFoundException('Company not found');
        const updateData = {};
        if (dto.name)
            updateData.name = dto.name;
        if (dto.domain !== undefined)
            updateData.domain = dto.domain;
        if (dto.logo !== undefined)
            updateData.logo = dto.logo;
        if (dto.branding)
            updateData.branding = typeof dto.branding === 'string' ? dto.branding : JSON.stringify(dto.branding);
        if (dto.settings)
            updateData.settings = typeof dto.settings === 'string' ? dto.settings : JSON.stringify(dto.settings);
        return this.prisma.company.update({
            where: { id: companyId },
            data: updateData,
            select: { id: true, name: true, domain: true, logo: true, branding: true, settings: true },
        });
    }
    async createCompanyUser(dto, companyId) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing)
            throw new common_1.BadRequestException('Email already in use');
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
    async removeCompanyUser(userId, companyId) {
        const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
        if (!user)
            throw new common_1.NotFoundException('User not found in your company');
        return this.prisma.user.update({
            where: { id: userId },
            data: { deletedAt: new Date(), isActive: false },
            select: { id: true, email: true },
        });
    }
    async listAuditLogs(query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const skip = (page - 1) * limit;
        const where = {};
        if (query.companyId)
            where.companyId = query.companyId;
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
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
//# sourceMappingURL=admin.service.js.map