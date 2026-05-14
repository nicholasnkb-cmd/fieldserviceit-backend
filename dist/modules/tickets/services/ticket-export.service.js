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
exports.TicketExportService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
let TicketExportService = class TicketExportService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async exportCsv(companyId, status) {
        const where = { companyId, deletedAt: null };
        if (status)
            where.status = status;
        const tickets = await this.prisma.ticket.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                createdBy: { select: { firstName: true, lastName: true, email: true } },
                assignedTo: { select: { firstName: true, lastName: true, email: true } },
            },
        });
        const header = 'TicketNumber,Title,Status,Priority,Category,ContactName,ContactEmail,ContactPhone,CreatedBy,AssignedTo,CreatedAt,ResolvedAt,Resolution\n';
        const rows = tickets.map((t) => [
            t.ticketNumber,
            `"${(t.title || '').replace(/"/g, '""')}"`,
            t.status,
            t.priority,
            t.category || '',
            t.contactName || '',
            t.contactEmail || '',
            t.contactPhone || '',
            t.createdBy ? `${t.createdBy.firstName} ${t.createdBy.lastName}` : '',
            t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '',
            t.createdAt?.toISOString() || '',
            t.resolvedAt?.toISOString() || '',
            `"${(t.resolution || '').replace(/"/g, '""')}"`,
        ].join(',')).join('\n');
        return header + rows;
    }
};
exports.TicketExportService = TicketExportService;
exports.TicketExportService = TicketExportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TicketExportService);
//# sourceMappingURL=ticket-export.service.js.map