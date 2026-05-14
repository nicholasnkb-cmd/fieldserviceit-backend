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
var RmmIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RmmIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
const rmm_provider_factory_service_1 = require("./rmm-provider-factory.service");
const ticket_timeline_service_1 = require("../../tickets/services/ticket-timeline.service");
const notifications_service_1 = require("../../notifications/services/notifications.service");
const tickets_gateway_1 = require("../../tickets/events/tickets.gateway");
let RmmIntegrationService = RmmIntegrationService_1 = class RmmIntegrationService {
    constructor(prisma, providerFactory, timeline, notificationsService, gateway) {
        this.prisma = prisma;
        this.providerFactory = providerFactory;
        this.timeline = timeline;
        this.notificationsService = notificationsService;
        this.gateway = gateway;
        this.logger = new common_1.Logger(RmmIntegrationService_1.name);
    }
    async syncAsset(provider, assetData, companyId) {
        const rmmProvider = this.providerFactory.getProvider(provider);
        const mapped = await rmmProvider.syncAsset(assetData);
        const name = mapped.name || assetData.name || 'Unknown Asset';
        const assetType = mapped.assetType || assetData.assetType || 'OTHER';
        const serialNumber = mapped.serialNumber || assetData.serialNumber;
        const manufacturer = mapped.manufacturer || assetData.manufacturer;
        const model = mapped.model || assetData.model;
        const os = mapped.os || assetData.os;
        const ipAddress = mapped.ipAddress || assetData.ipAddress;
        const location = mapped.location || assetData.location;
        const status = mapped.status || assetData.status || 'ACTIVE';
        if (serialNumber) {
            const existing = await this.prisma.asset.findFirst({
                where: { serialNumber, companyId, deletedAt: null },
            });
            if (existing) {
                return this.prisma.asset.update({
                    where: { id: existing.id },
                    data: { name, assetType, manufacturer, model, os, ipAddress, location, status },
                });
            }
        }
        return this.prisma.asset.create({
            data: { name, assetType, serialNumber, manufacturer, model, os, ipAddress, location, status, companyId },
        });
    }
    async createTicketFromAlert(provider, alert, companyId) {
        const rmmProvider = this.providerFactory.getProvider(provider);
        const mapped = await rmmProvider.createAlert(alert);
        const title = mapped.title || alert.title || `[${provider}] RMM Alert`;
        const description = mapped.description || alert.description || '';
        const priority = this.mapPriority(mapped.severity || alert.severity);
        let userId = alert.assignedUserId;
        if (!userId) {
            const tenantAdmin = await this.prisma.user.findFirst({
                where: { companyId, role: 'TENANT_ADMIN', deletedAt: null },
                orderBy: { createdAt: 'asc' },
            });
            userId = tenantAdmin?.id;
        }
        if (!userId) {
            const firstUser = await this.prisma.user.findFirst({
                where: { companyId, deletedAt: null },
                orderBy: { createdAt: 'asc' },
            });
            userId = firstUser?.id;
        }
        if (!userId)
            throw new Error('No user found in company to create ticket');
        const ticketCount = await this.prisma.ticket.count({ where: { companyId } });
        const shortId = companyId.slice(0, 4).toUpperCase();
        const ticketNumber = `TKT-${shortId}-${(ticketCount + 1).toString().padStart(5, '0')}`;
        const sourceInfo = mapped.deviceName
            ? `Device: ${mapped.deviceName}\nAlert ID: ${mapped.alertId || 'N/A'}\nSource: ${mapped.source || provider}`
            : `Alert ID: ${mapped.alertId || 'N/A'}\nSource: ${mapped.source || provider}`;
        const fullDescription = description
            ? `${description}\n\n---\n${sourceInfo}`
            : sourceInfo;
        const ticket = await this.prisma.ticket.create({
            data: {
                title,
                description: fullDescription,
                ticketNumber,
                type: 'INCIDENT',
                priority,
                companyId,
                createdById: userId,
            },
            include: {
                createdBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        await this.timeline.addEntry(ticket.id, userId, 'RMM_ALERT', `Ticket auto-created from ${provider} alert: ${title}`);
        const notifyUsers = await this.prisma.user.findMany({
            where: {
                companyId,
                role: { in: ['TENANT_ADMIN', 'TECHNICIAN'] },
                isActive: true,
                deletedAt: null,
            },
        });
        for (const u of notifyUsers) {
            await this.notificationsService.create({
                userId: u.id,
                companyId,
                title: `[${provider}] New alert ticket: ${ticketNumber}`,
                body: title,
                type: 'info',
                link: `/tickets/${ticket.id}`,
            });
        }
        this.gateway.notifyTicketUpdate(companyId, 'ticket:created', ticket);
        this.logger.log(`Created ticket ${ticketNumber} from ${provider} alert: ${title}`);
        return ticket;
    }
    mapPriority(severity) {
        if (!severity)
            return 'MEDIUM';
        const s = severity.toLowerCase();
        if (s === 'critical' || s === 'emergency')
            return 'CRITICAL';
        if (s === 'warning' || s === 'high')
            return 'HIGH';
        if (s === 'info' || s === 'low')
            return 'LOW';
        return 'MEDIUM';
    }
};
exports.RmmIntegrationService = RmmIntegrationService;
exports.RmmIntegrationService = RmmIntegrationService = RmmIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        rmm_provider_factory_service_1.RmmProviderFactory,
        ticket_timeline_service_1.TicketTimelineService,
        notifications_service_1.NotificationsService,
        tickets_gateway_1.TicketsGateway])
], RmmIntegrationService);
//# sourceMappingURL=rmm-integration.service.js.map