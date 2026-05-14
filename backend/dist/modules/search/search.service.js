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
exports.SearchService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let SearchService = class SearchService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async search(companyId, query, userType, userId) {
        const [tickets, assets] = await Promise.all([
            this.searchTickets(companyId, query, userType, userId),
            this.searchAssets(companyId, query),
        ]);
        return { tickets, assets };
    }
    async searchTickets(companyId, query, userType, userId) {
        const where = {
            deletedAt: null,
            OR: [
                { title: { contains: query } },
                { ticketNumber: { contains: query } },
                { description: { contains: query } },
            ],
        };
        if (userType === 'PUBLIC') {
            where.createdById = userId;
        }
        else if (companyId) {
            where.companyId = companyId;
        }
        return this.prisma.ticket.findMany({
            where,
            take: 25,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                ticketNumber: true,
                title: true,
                status: true,
                priority: true,
                category: true,
                createdAt: true,
            },
        });
    }
    async searchAssets(companyId, query) {
        if (!companyId)
            return [];
        return this.prisma.asset.findMany({
            where: {
                companyId,
                deletedAt: null,
                OR: [
                    { name: { contains: query } },
                    { serialNumber: { contains: query } },
                    { ipAddress: { contains: query } },
                    { model: { contains: query } },
                    { location: { contains: query } },
                ],
            },
            take: 25,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                assetType: true,
                serialNumber: true,
                status: true,
                location: true,
            },
        });
    }
};
exports.SearchService = SearchService;
exports.SearchService = SearchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SearchService);
//# sourceMappingURL=search.service.js.map