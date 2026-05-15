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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
const bcrypt = require("bcryptjs");
var UserRole;
(function (UserRole) {
    UserRole["SUPER_ADMIN"] = "SUPER_ADMIN";
    UserRole["TENANT_ADMIN"] = "TENANT_ADMIN";
    UserRole["TECHNICIAN"] = "TECHNICIAN";
    UserRole["CLIENT"] = "CLIENT";
    UserRole["READ_ONLY"] = "READ_ONLY";
})(UserRole || (UserRole = {}));
let UsersService = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto, companyId) {
        const passwordHash = await bcrypt.hash(dto.password, 10);
        return this.prisma.user.create({
            data: {
                email: dto.email,
                firstName: dto.firstName,
                lastName: dto.lastName,
                role: dto.role ?? UserRole.CLIENT,
                passwordHash,
                companyId,
            },
            select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true, createdAt: true },
        });
    }
    async findAll(companyId, query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.user.findMany({
                where: { companyId, deletedAt: null },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
            }),
            this.prisma.user.count({ where: { companyId, deletedAt: null } }),
        ]);
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }
    async findById(id) {
        const user = await this.prisma.user.findFirst({
            where: { id, deletedAt: null },
            select: {
                id: true, email: true, firstName: true, lastName: true, role: true, userType: true,
                phone: true, avatarUrl: true, companyId: true, isActive: true, lastLoginAt: true, createdAt: true,
            },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    async findOne(id, companyId) {
        const user = await this.prisma.user.findFirst({
            where: { id, companyId, deletedAt: null },
            select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true, avatarUrl: true, isActive: true, lastLoginAt: true, createdAt: true },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return user;
    }
    async update(id, dto, companyId) {
        await this.findOne(id, companyId);
        return this.prisma.user.update({
            where: { id },
            data: dto,
            select: { id: true, email: true, firstName: true, lastName: true, role: true },
        });
    }
    async updateMe(id, dto) {
        const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        return this.prisma.user.update({
            where: { id },
            data: dto,
            select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, companyId: true, createdAt: true },
        });
    }
    async changePassword(id, oldPassword, newPassword) {
        const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        if (!user.passwordHash)
            throw new common_1.BadRequestException('Password not set');
        const valid = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!valid)
            throw new common_1.BadRequestException('Current password is incorrect');
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({ where: { id }, data: { passwordHash } });
        return { message: 'Password changed successfully' };
    }
    async remove(id, companyId) {
        await this.findOne(id, companyId);
        return this.prisma.user.update({
            where: { id },
            data: { deletedAt: new Date(), isActive: false },
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map