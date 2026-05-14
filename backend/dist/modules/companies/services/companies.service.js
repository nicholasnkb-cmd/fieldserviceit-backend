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
exports.CompaniesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
let CompaniesService = class CompaniesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto) {
        return this.prisma.company.create({ data: dto });
    }
    async findAll(query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.company.findMany({
                where: { deletedAt: null },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { _count: { select: { users: true, tickets: true, assets: true } } },
            }),
            this.prisma.company.count({ where: { deletedAt: null } }),
        ]);
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }
    async findOne(id) {
        const company = await this.prisma.company.findFirst({
            where: { id, deletedAt: null },
            include: { _count: { select: { users: true, tickets: true, assets: true } } },
        });
        if (!company)
            throw new common_1.NotFoundException('Company not found');
        return company;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.prisma.company.update({ where: { id }, data: dto });
    }
    async remove(id) {
        await this.findOne(id);
        return this.prisma.company.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    }
    async getStats(id) {
        const [tickets, users, assets, dispatches] = await Promise.all([
            this.prisma.ticket.count({ where: { companyId: id, deletedAt: null } }),
            this.prisma.user.count({ where: { companyId: id, deletedAt: null } }),
            this.prisma.asset.count({ where: { companyId: id, deletedAt: null } }),
            this.prisma.dispatch.count({ where: { companyId: id } }),
        ]);
        return { tickets, users, assets, dispatches };
    }
};
exports.CompaniesService = CompaniesService;
exports.CompaniesService = CompaniesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CompaniesService);
//# sourceMappingURL=companies.service.js.map