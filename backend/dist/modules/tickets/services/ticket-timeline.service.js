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
exports.TicketTimelineService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
let TicketTimelineService = class TicketTimelineService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async addEntry(ticketId, actorId, action, comment, oldValue, newValue, isInternal) {
        return this.prisma.ticketTimeline.create({
            data: { ticketId, actorId, action, comment, oldValue, newValue, isInternal: isInternal ?? false },
            include: { actor: { select: { id: true, firstName: true, lastName: true } } },
        });
    }
    async getTimeline(ticketId) {
        return this.prisma.ticketTimeline.findMany({
            where: { ticketId },
            orderBy: { createdAt: 'desc' },
            include: { actor: { select: { id: true, firstName: true, lastName: true } } },
        });
    }
};
exports.TicketTimelineService = TicketTimelineService;
exports.TicketTimelineService = TicketTimelineService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TicketTimelineService);
//# sourceMappingURL=ticket-timeline.service.js.map