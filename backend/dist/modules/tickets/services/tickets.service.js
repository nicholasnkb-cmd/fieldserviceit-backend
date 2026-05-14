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
exports.TicketsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
const tickets_gateway_1 = require("../events/tickets.gateway");
const ticket_timeline_service_1 = require("./ticket-timeline.service");
const email_service_1 = require("../../notifications/services/email.service");
const notifications_service_1 = require("../../notifications/services/notifications.service");
const crypto = require("crypto");
const validTransitions = {
    OPEN: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
    ASSIGNED: ['IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN', 'ON_HOLD'],
    IN_PROGRESS: ['RESOLVED', 'CLOSED', 'ASSIGNED', 'OPEN', 'ON_HOLD'],
    ON_HOLD: ['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'OPEN'],
    RESOLVED: ['CLOSED', 'OPEN'],
    CLOSED: ['OPEN'],
};
let TicketsService = class TicketsService {
    constructor(prisma, gateway, timeline, emailService, notificationsService) {
        this.prisma = prisma;
        this.gateway = gateway;
        this.timeline = timeline;
        this.emailService = emailService;
        this.notificationsService = notificationsService;
    }
    validateTransition(from, to) {
        if (from === to)
            return;
        const allowed = validTransitions[from];
        if (!allowed || !allowed.includes(to)) {
            throw new common_1.BadRequestException(`Invalid status transition from ${from} to ${to}`);
        }
    }
    async create(dto, companyId, userId, userType) {
        if (!dto.contactName || !dto.contactEmail || !dto.contactPhone) {
            throw new common_1.BadRequestException('contactName, contactEmail, and contactPhone are required');
        }
        if (!dto.title) {
            throw new common_1.BadRequestException('title is required');
        }
        const companyIdForTicket = userType === 'PUBLIC' ? null : companyId;
        const count = await this.prisma.ticket.count({
            where: companyIdForTicket ? { companyId: companyIdForTicket } : { createdById: userId },
        });
        const prefix = companyIdForTicket
            ? `TKT-${companyIdForTicket.slice(0, 4).toUpperCase()}`
            : `TKT-PUB`;
        const ticketNumber = `${prefix}-${(count + 1).toString().padStart(5, '0')}`;
        const trackingToken = crypto.randomBytes(16).toString('hex');
        const ticket = await this.prisma.ticket.create({
            data: {
                title: dto.title,
                description: dto.description,
                contactName: dto.contactName,
                contactEmail: dto.contactEmail,
                contactPhone: dto.contactPhone,
                category: dto.category,
                subcategory: dto.subcategory,
                location: dto.location,
                latitude: dto.latitude,
                longitude: dto.longitude,
                priority: dto.priority,
                type: dto.type,
                assetId: dto.assetId,
                slaId: dto.slaId,
                ticketNumber,
                companyId: companyIdForTicket,
                createdById: userId,
                trackingToken,
            },
            include: {
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                assignedTo: { select: { id: true, firstName: true, lastName: true } },
                asset: true,
            },
        });
        await this.timeline.addEntry(ticket.id, userId, 'CREATED', `Ticket created with status ${dto.priority || 'MEDIUM'} priority`);
        if (companyIdForTicket)
            this.gateway.notifyTicketUpdate(companyIdForTicket, 'ticket:created', ticket);
        return ticket;
    }
    async findAll(user, query) {
        const page = Number(query.page) || 1;
        const limit = Number(query.limit) || 25;
        const skip = (page - 1) * limit;
        const where = { deletedAt: null };
        if (user.userType === 'PUBLIC') {
            where.createdById = user.id;
        }
        else {
            where.companyId = user.companyId;
        }
        if (query.status)
            where.status = query.status;
        if (query.search) {
            where.OR = [
                { title: { contains: query.search } },
                { ticketNumber: { contains: query.search } },
            ];
        }
        const [data, total] = await Promise.all([
            this.prisma.ticket.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    createdBy: { select: { id: true, firstName: true, lastName: true } },
                    assignedTo: { select: { id: true, firstName: true, lastName: true } },
                    resolvedBy: { select: { id: true, firstName: true, lastName: true } },
                    asset: { select: { id: true, name: true, assetType: true } },
                },
            }),
            this.prisma.ticket.count({ where }),
        ]);
        return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }
    async findOne(id, user) {
        const where = { id, deletedAt: null };
        if (user.userType === 'PUBLIC') {
            where.createdById = user.id;
        }
        else {
            where.companyId = user.companyId;
        }
        const ticket = await this.prisma.ticket.findFirst({
            where,
            include: {
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
                resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                asset: true,
                sla: true,
                timeline: { orderBy: { createdAt: 'desc' }, take: 50, include: { actor: { select: { id: true, firstName: true, lastName: true } } } },
                attachments: { include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } } },
                dispatches: true,
            },
        });
        if (!ticket)
            throw new common_1.NotFoundException('Ticket not found');
        if (ticket.sla) {
            const elapsedMs = Date.now() - ticket.createdAt.getTime();
            const resolutionMs = ticket.sla.resolutionTimeMin * 60 * 1000;
            const pct = Math.min(100, Math.round((elapsedMs / resolutionMs) * 100));
            ticket.slaStatus = pct >= 100 ? 'breached' : pct >= 75 ? 'at_risk' : 'within_sla';
            ticket.slaProgress = pct;
        }
        return ticket;
    }
    async update(id, dto, companyId, userId) {
        const ticket = await this.findOne(id, { companyId, userType: 'BUSINESS' });
        const newStatus = dto.status;
        if (newStatus && newStatus !== ticket.status) {
            this.validateTransition(ticket.status, newStatus);
            if (newStatus === 'ON_HOLD' && !dto.onHoldReason) {
                throw new common_1.BadRequestException('onHoldReason is required when placing a ticket on hold');
            }
        }
        const data = { ...dto };
        if (dto.assignedToId) {
            data.assignedToId = dto.assignedToId;
            if (!newStatus && ticket.status === 'OPEN') {
                data.status = 'ASSIGNED';
            }
        }
        if (newStatus && newStatus !== 'ON_HOLD' && ticket.status === 'ON_HOLD') {
            data.onHoldReason = null;
        }
        if (newStatus === 'RESOLVED' && ticket.status !== 'RESOLVED') {
            data.resolvedAt = new Date();
            data.resolvedById = userId;
            if (!data.resolution) {
                data.resolution = dto.resolution || '';
            }
        }
        if (newStatus && newStatus !== 'RESOLVED' && ticket.status === 'RESOLVED') {
            data.resolvedAt = null;
            data.resolvedById = null;
            data.resolution = null;
        }
        const updated = await this.prisma.ticket.update({
            where: { id },
            data,
            include: {
                createdBy: { select: { id: true, firstName: true, lastName: true } },
                assignedTo: { select: { id: true, firstName: true, lastName: true } },
                resolvedBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        if (newStatus && newStatus !== ticket.status) {
            await this.timeline.addEntry(id, userId, 'STATUS_CHANGED', `Status changed from ${ticket.status} to ${newStatus}`, ticket.status, newStatus);
            if (newStatus === 'ON_HOLD') {
                await this.timeline.addEntry(id, userId, 'HOLD', dto.onHoldReason || 'Ticket placed on hold');
                const holdActor = await this.prisma.user.findUnique({ where: { id: userId } });
                if (ticket.assignedToId) {
                    const assignedUser = await this.prisma.user.findUnique({ where: { id: ticket.assignedToId } });
                    if (assignedUser) {
                        await this.notificationsService.create({ userId: assignedUser.id, companyId, title: `Ticket ${ticket.ticketNumber} on hold`, body: dto.onHoldReason, type: 'info', link: `/tickets/${id}` });
                        if (assignedUser.email) {
                            this.emailService.sendNotificationEmail(assignedUser.email, `Ticket ${ticket.ticketNumber} on hold`, `<p>Ticket <strong>${ticket.ticketNumber}</strong> has been placed on hold.</p><p>Reason: ${dto.onHoldReason}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => { });
                        }
                    }
                }
            }
            if (newStatus === 'RESOLVED') {
                await this.timeline.addEntry(id, userId, 'RESOLVED', dto.resolution || 'Ticket resolved', ticket.status, 'RESOLVED');
                if (ticket.createdById) {
                    await this.notificationsService.create({ userId: ticket.createdById, companyId, title: `Ticket ${ticket.ticketNumber} resolved`, body: dto.resolution || 'Ticket has been resolved', type: 'success', link: `/tickets/${id}` });
                    if (ticket.contactEmail) {
                        this.emailService.sendNotificationEmail(ticket.contactEmail, `Ticket ${ticket.ticketNumber} resolved`, `<p>Your ticket <strong>${ticket.ticketNumber}</strong> has been resolved.</p><p>Resolution: ${dto.resolution || 'N/A'}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => { });
                    }
                }
            }
        }
        if (dto.assignedToId && dto.assignedToId !== ticket.assignedToId) {
            await this.timeline.addEntry(id, userId, 'ASSIGNED', `Assigned to user ${dto.assignedToId}`, ticket.assignedToId || 'unassigned', dto.assignedToId);
            const assignedUser = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } });
            if (assignedUser) {
                await this.notificationsService.create({ userId: assignedUser.id, companyId, title: `Ticket ${ticket.ticketNumber} assigned to you`, body: ticket.title, type: 'info', link: `/tickets/${id}` });
                if (assignedUser.email) {
                    this.emailService.sendNotificationEmail(assignedUser.email, `Ticket ${ticket.ticketNumber} assigned to you`, `<p>Ticket <strong>${ticket.ticketNumber}</strong> has been assigned to you.</p><p>Title: ${ticket.title}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => { });
                }
            }
        }
        this.gateway.notifyTicketUpdate(companyId, 'ticket:updated', updated);
        return updated;
    }
    async remove(id, companyId) {
        await this.findOne(id, { companyId, userType: 'BUSINESS' });
        const deleted = await this.prisma.ticket.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
        this.gateway.notifyTicketUpdate(companyId, 'ticket:deleted', { id });
        return deleted;
    }
    async assign(id, targetUserId, companyId, actorUserId) {
        const ticket = await this.findOne(id, { companyId, userType: 'BUSINESS' });
        this.validateTransition(ticket.status, 'ASSIGNED');
        const updated = await this.prisma.ticket.update({
            where: { id },
            data: { assignedToId: targetUserId, status: 'ASSIGNED' },
            include: {
                assignedTo: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        await this.timeline.addEntry(id, actorUserId || targetUserId, 'ASSIGNED', `Assigned to user`, ticket.assignedToId || 'unassigned', targetUserId);
        const assignedUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
        if (assignedUser) {
            await this.notificationsService.create({ userId: assignedUser.id, companyId, title: `Ticket ${ticket.ticketNumber} assigned to you`, body: ticket.title, type: 'info', link: `/tickets/${id}` });
            if (assignedUser.email) {
                this.emailService.sendNotificationEmail(assignedUser.email, `Ticket ${ticket.ticketNumber} assigned to you`, `<p>Ticket <strong>${ticket.ticketNumber}</strong> has been assigned to you.</p><p>Title: ${ticket.title}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => { });
            }
        }
        this.gateway.notifyTicketUpdate(companyId, 'ticket:assigned', updated);
        return updated;
    }
    async resolve(id, resolution, companyId, userId) {
        const ticket = await this.findOne(id, { companyId, userType: 'BUSINESS' });
        this.validateTransition(ticket.status, 'RESOLVED');
        const updated = await this.prisma.ticket.update({
            where: { id },
            data: { status: 'RESOLVED', resolution, resolvedAt: new Date(), resolvedById: userId },
            include: {
                resolvedBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
        await this.timeline.addEntry(id, userId, 'RESOLVED', resolution || 'Ticket resolved', ticket.status, 'RESOLVED');
        if (ticket.createdById) {
            await this.notificationsService.create({ userId: ticket.createdById, companyId, title: `Ticket ${ticket.ticketNumber} resolved`, body: resolution || 'Ticket has been resolved', type: 'success', link: `/tickets/${id}` });
            if (ticket.contactEmail) {
                this.emailService.sendNotificationEmail(ticket.contactEmail, `Ticket ${ticket.ticketNumber} resolved`, `<p>Your ticket <strong>${ticket.ticketNumber}</strong> has been resolved.</p><p>Resolution: ${resolution || 'N/A'}</p><p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${id}">View Ticket</a></p>`).catch(() => { });
            }
        }
        this.gateway.notifyTicketUpdate(companyId, 'ticket:resolved', updated);
        return updated;
    }
};
exports.TicketsService = TicketsService;
exports.TicketsService = TicketsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        tickets_gateway_1.TicketsGateway,
        ticket_timeline_service_1.TicketTimelineService,
        email_service_1.EmailService,
        notifications_service_1.NotificationsService])
], TicketsService);
//# sourceMappingURL=tickets.service.js.map