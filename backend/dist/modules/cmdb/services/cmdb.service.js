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
exports.CmdbService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
let CmdbService = class CmdbService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto, companyId) {
        return this.prisma.asset.create({ data: { ...dto, companyId } });
    }
    async findAll(companyId, query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const skip = (page - 1) * limit;
        const where = { companyId, deletedAt: null };
        if (query.assetType)
            where.assetType = query.assetType;
        if (query.search) {
            where.OR = [
                { name: { contains: query.search } },
                { serialNumber: { contains: query.search } },
                { ipAddress: { contains: query.search } },
            ];
        }
        const [data, total] = await Promise.all([
            this.prisma.asset.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
            this.prisma.asset.count({ where }),
        ]);
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }
    async findOne(id, companyId) {
        const asset = await this.prisma.asset.findFirst({
            where: { id, companyId, deletedAt: null },
            include: { tickets: { take: 10, orderBy: { createdAt: 'desc' } } },
        });
        if (!asset)
            throw new common_1.NotFoundException('Asset not found');
        return asset;
    }
    async update(id, dto, companyId) {
        await this.findOne(id, companyId);
        return this.prisma.asset.update({ where: { id }, data: dto });
    }
    async remove(id, companyId) {
        await this.findOne(id, companyId);
        return this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
    }
};
exports.CmdbService = CmdbService;
exports.CmdbService = CmdbService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CmdbService);
//# sourceMappingURL=cmdb.service.js.map