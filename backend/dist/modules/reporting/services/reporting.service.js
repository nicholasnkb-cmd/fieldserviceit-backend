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
exports.ReportingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
let ReportingService = class ReportingService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getTicketSummary(companyId, from, to) {
        const dateFilter = { companyId, deletedAt: null };
        if (from || to) {
            dateFilter.createdAt = {};
            if (from)
                dateFilter.createdAt.gte = new Date(from);
            if (to)
                dateFilter.createdAt.lte = new Date(to);
        }
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const resolvedTodayFilter = { companyId, status: 'RESOLVED', resolvedAt: { gte: todayStart }, deletedAt: null };
        const [total, byStatus, byPriority, resolvedToday, resolvedTickets] = await Promise.all([
            this.prisma.ticket.count({ where: dateFilter }),
            this.prisma.ticket.groupBy({ by: ['status'], where: dateFilter, _count: true }),
            this.prisma.ticket.groupBy({ by: ['priority'], where: dateFilter, _count: true }),
            this.prisma.ticket.count({ where: resolvedTodayFilter }),
            this.prisma.ticket.findMany({ where: { companyId, status: 'RESOLVED', resolvedAt: { not: null }, deletedAt: null }, select: { createdAt: true, resolvedAt: true } }),
        ]);
        const avgResolutionTime = resolvedTickets.length
            ? Math.round(resolvedTickets.reduce((sum, t) => sum + (t.resolvedAt.getTime() - t.createdAt.getTime()), 0) / resolvedTickets.length / (1000 * 60))
            : 0;
        return { total, byStatus, byPriority, resolvedToday, avgResolutionTime };
    }
    async getSlaCompliance(companyId) {
        const tickets = await this.prisma.ticket.findMany({
            where: { companyId, slaId: { not: null }, status: 'RESOLVED', resolvedAt: { not: null } },
            include: { sla: true },
        });
        const compliant = tickets.filter((t) => {
            if (!t.resolvedAt || !t.sla)
                return false;
            const resolutionMs = t.resolvedAt.getTime() - t.createdAt.getTime();
            return resolutionMs <= t.sla.resolutionTimeMin * 60 * 1000;
        });
        return { total: tickets.length, compliant: compliant.length, rate: tickets.length ? (compliant.length / tickets.length) * 100 : 0 };
    }
    async getTechnicianPerformance(companyId) {
        const technicians = await this.prisma.user.findMany({
            where: { companyId, role: 'TECHNICIAN' },
            include: {
                assignedTickets: { where: { status: 'RESOLVED' }, select: { id: true, createdAt: true, resolvedAt: true } },
                dispatches: true,
            },
        });
        return technicians.map((t) => ({
            id: t.id,
            name: `${t.firstName} ${t.lastName}`,
            resolvedTickets: t.assignedTickets.length,
            avgResolutionTime: this.calculateAvgResolution(t.assignedTickets),
            totalDispatches: t.dispatches.length,
        }));
    }
    async getAssetInventory(companyId) {
        return this.prisma.asset.groupBy({
            by: ['assetType'],
            where: { companyId, deletedAt: null },
            _count: true,
        });
    }
    async getActivityFeed(companyId, limit = 30) {
        return this.prisma.ticketTimeline.findMany({
            where: { ticket: { companyId, deletedAt: null } },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                actor: { select: { id: true, firstName: true, lastName: true } },
                ticket: { select: { id: true, ticketNumber: true, title: true, status: true } },
            },
        });
    }
    calculateAvgResolution(tickets) {
        if (!tickets.length)
            return 0;
        const total = tickets.reduce((sum, t) => {
            if (!t.resolvedAt)
                return sum;
            return sum + (t.resolvedAt.getTime() - t.createdAt.getTime());
        }, 0);
        return Math.round(total / tickets.length / (1000 * 60));
    }
};
exports.ReportingService = ReportingService;
exports.ReportingService = ReportingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReportingService);
//# sourceMappingURL=reporting.service.js.map