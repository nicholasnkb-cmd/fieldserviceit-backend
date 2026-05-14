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
exports.FieldServiceService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
const tickets_gateway_1 = require("../../tickets/events/tickets.gateway");
let FieldServiceService = class FieldServiceService {
    constructor(prisma, gateway) {
        this.prisma = prisma;
        this.gateway = gateway;
    }
    async dispatch(ticketId, technicianId, companyId) {
        const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, companyId } });
        if (!ticket)
            throw new common_1.NotFoundException('Ticket not found');
        const result = await this.prisma.dispatch.create({
            data: { ticketId, technicianId, companyId, status: 'DISPATCHED' },
            include: { ticket: true, technician: { select: { id: true, firstName: true, lastName: true } } },
        });
        this.gateway.notifyTicketUpdate(companyId, 'dispatch:created', result);
        return result;
    }
    async getDispatchBoard(companyId) {
        return this.prisma.dispatch.findMany({
            where: { companyId },
            orderBy: { createdAt: 'desc' },
            include: {
                ticket: { select: { id: true, ticketNumber: true, title: true, priority: true, status: true } },
                technician: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            },
        });
    }
    async updateStatus(id, status, companyId) {
        const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
        if (!dispatch)
            throw new common_1.NotFoundException('Dispatch not found');
        const updateData = { status };
        if (status === 'EN_ROUTE')
            updateData.arrivedAt = new Date();
        if (status === 'COMPLETED')
            updateData.completedAt = new Date();
        const result = await this.prisma.dispatch.update({ where: { id }, data: updateData });
        this.gateway.notifyTicketUpdate(companyId, 'dispatch:updated', result);
        return result;
    }
    async addNotes(id, notes, companyId) {
        const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
        if (!dispatch)
            throw new common_1.NotFoundException('Dispatch not found');
        const result = await this.prisma.dispatch.update({ where: { id }, data: { notes } });
        this.gateway.notifyTicketUpdate(companyId, 'dispatch:updated', result);
        return result;
    }
    async addSignature(id, signature, companyId) {
        const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
        if (!dispatch)
            throw new common_1.NotFoundException('Dispatch not found');
        const result = await this.prisma.dispatch.update({ where: { id }, data: { customerSignature: signature, status: 'COMPLETED', completedAt: new Date() } });
        this.gateway.notifyTicketUpdate(companyId, 'dispatch:completed', result);
        return result;
    }
    async addPhotos(id, photoUrls, companyId) {
        const dispatch = await this.prisma.dispatch.findFirst({ where: { id, companyId } });
        if (!dispatch)
            throw new common_1.NotFoundException('Dispatch not found');
        const existing = JSON.parse(dispatch.photoUrls || '[]');
        const updated = [...existing, ...photoUrls];
        const result = await this.prisma.dispatch.update({ where: { id }, data: { photoUrls: JSON.stringify(updated) } });
        this.gateway.notifyTicketUpdate(companyId, 'dispatch:updated', result);
        return result;
    }
};
exports.FieldServiceService = FieldServiceService;
exports.FieldServiceService = FieldServiceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, tickets_gateway_1.TicketsGateway])
], FieldServiceService);
//# sourceMappingURL=field-service.service.js.map