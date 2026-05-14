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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketsController = void 0;
const common_1 = require("@nestjs/common");
const tickets_service_1 = require("../services/tickets.service");
const create_ticket_dto_1 = require("../dto/create-ticket.dto");
const update_ticket_dto_1 = require("../dto/update-ticket.dto");
const create_comment_dto_1 = require("../dto/create-comment.dto");
const ticket_timeline_service_1 = require("../services/ticket-timeline.service");
const ticket_export_service_1 = require("../services/ticket-export.service");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../../common/guards/tenant.guard");
const business_only_guard_1 = require("../../../common/guards/business-only.guard");
const business_only_decorator_1 = require("../../../common/decorators/business-only.decorator");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const public_decorator_1 = require("../../../common/decorators/public.decorator");
const prisma_service_1 = require("../../../database/prisma.service");
let TicketsController = class TicketsController {
    constructor(ticketsService, timelineService, exportService, prisma) {
        this.ticketsService = ticketsService;
        this.timelineService = timelineService;
        this.exportService = exportService;
        this.prisma = prisma;
    }
    create(dto, user) {
        return this.ticketsService.create(dto, user.companyId, user.id, user.userType);
    }
    findAll(query, user) {
        return this.ticketsService.findAll(user, query);
    }
    async exportCsv(status, user, res) {
        const csv = await this.exportService.exportCsv(user.companyId, status);
        res.send(csv);
    }
    async getBoard(user) {
        const tickets = await this.prisma.ticket.findMany({
            where: { companyId: user.companyId, deletedAt: null },
            orderBy: { updatedAt: 'desc' },
            take: 200,
            select: {
                id: true, ticketNumber: true, title: true, status: true, priority: true,
                contactName: true, category: true,
                assignedTo: { select: { id: true, firstName: true, lastName: true } },
                createdAt: true,
            },
        });
        const columns = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'];
        const board = columns.map((s) => ({ status: s, tickets: tickets.filter((t) => t.status === s) }));
        return { columns: board };
    }
    findOne(id, user) {
        return this.ticketsService.findOne(id, user);
    }
    update(id, dto, user) {
        return this.ticketsService.update(id, dto, user.companyId, user.id);
    }
    remove(id, user) {
        return this.ticketsService.remove(id, user.companyId);
    }
    assign(id, userId, user) {
        return this.ticketsService.assign(id, userId, user.companyId, user.id);
    }
    resolve(id, resolution, user) {
        return this.ticketsService.resolve(id, resolution, user.companyId, user.id);
    }
    addComment(id, dto, user) {
        return this.timelineService.addEntry(id, user.id, 'COMMENT', dto.comment, undefined, undefined, dto.isInternal);
    }
    getTimeline(id, user) {
        return this.timelineService.getTimeline(id);
    }
    async addAttachment(id, body, user) {
        const attachment = await this.prisma.ticketAttachment.create({
            data: { ticketId: id, fileUrl: body.fileUrl, fileName: body.fileName, fileSize: body.fileSize, mimeType: body.mimeType, uploadedById: user.id },
            include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
        });
        await this.timelineService.addEntry(id, user.id, 'ATTACHMENT', `File attached: ${body.fileName}`);
        return attachment;
    }
    async removeAttachment(id, attachmentId) {
        await this.prisma.ticketAttachment.delete({ where: { id: attachmentId } });
        return { success: true };
    }
    async bulkStatus(body, user) {
        const results = [];
        for (const id of body.ids) {
            try {
                const r = await this.ticketsService.update(id, { status: body.status }, user.companyId, user.id);
                results.push({ id, success: true });
            }
            catch {
                results.push({ id, success: false });
            }
        }
        return { results };
    }
    async bulkAssign(body, user) {
        const results = [];
        for (const id of body.ids) {
            try {
                await this.ticketsService.assign(id, body.userId, user.companyId, user.id);
                results.push({ id, success: true });
            }
            catch {
                results.push({ id, success: false });
            }
        }
        return { results };
    }
    async bulkDelete(body, user) {
        const results = [];
        for (const id of body.ids) {
            try {
                await this.ticketsService.remove(id, user.companyId);
                results.push({ id, success: true });
            }
            catch {
                results.push({ id, success: false });
            }
        }
        return { results };
    }
    async listTemplates(user) {
        return this.prisma.ticketTemplate.findMany({
            where: { companyId: user.companyId, isActive: true },
            orderBy: { name: 'asc' },
        });
    }
    async createTemplate(body, user) {
        return this.prisma.ticketTemplate.create({
            data: { ...body, companyId: user.companyId },
        });
    }
    async deleteTemplate(id) {
        await this.prisma.ticketTemplate.update({ where: { id }, data: { isActive: false } });
        return { success: true };
    }
    async addTimeEntry(id, body, user) {
        const entry = await this.prisma.timeEntry.create({
            data: {
                ticketId: id,
                userId: user.id,
                duration: body.duration,
                description: body.description,
                billable: body.billable ?? true,
                startTime: body.startTime ? new Date(body.startTime) : new Date(),
            },
        });
        await this.timelineService.addEntry(id, user.id, 'TIME', `Logged ${body.duration}m${body.description ? ': ' + body.description : ''}`);
        return entry;
    }
    async getTimeEntries(id) {
        return this.prisma.timeEntry.findMany({
            where: { ticketId: id },
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
        });
    }
    async inboundEmail(body, apiKey) {
        const expectedKey = process.env.INBOUND_EMAIL_API_KEY;
        if (expectedKey && apiKey !== expectedKey) {
            throw new common_1.UnauthorizedException('Invalid API key');
        }
        const user = await this.prisma.user.findFirst({ where: { email: body.from, userType: 'PUBLIC' } });
        if (!user)
            throw new common_1.NotFoundException('No public user found for this email');
        const count = await this.prisma.ticket.count({ where: { createdById: user.id } });
        const ticketNumber = `TKT-EMAIL-${(count + 1).toString().padStart(5, '0')}`;
        const trackingToken = require('crypto').randomBytes(16).toString('hex');
        const ticket = await this.prisma.ticket.create({
            data: {
                title: body.subject || 'Email submission',
                description: body.text || body.html || '',
                contactName: user.firstName || user.email,
                contactEmail: user.email,
                contactPhone: '',
                ticketNumber,
                createdById: user.id,
                trackingToken,
                status: 'OPEN',
            },
        });
        await this.timelineService.addEntry(ticket.id, user.id, 'CREATED', 'Ticket created from email');
        return { ticketNumber, id: ticket.id };
    }
};
exports.TicketsController = TicketsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_ticket_dto_1.CreateTicketDto, Object]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('export/csv'),
    (0, common_1.Header)('Content-Type', 'text/csv'),
    (0, common_1.Header)('Content-Disposition', 'attachment; filename="tickets.csv"'),
    __param(0, (0, common_1.Query)('status')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "exportCsv", null);
__decorate([
    (0, common_1.Get)('board'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "getBoard", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "findOne", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Patch)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_ticket_dto_1.UpdateTicketDto, Object]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "update", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "remove", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Post)(':id/assign'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "assign", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Post)(':id/resolve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)('resolution')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "resolve", null);
__decorate([
    (0, common_1.Post)(':id/comments'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_comment_dto_1.CreateCommentDto, Object]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "addComment", null);
__decorate([
    (0, common_1.Get)(':id/timeline'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TicketsController.prototype, "getTimeline", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Post)(':id/attachments'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "addAttachment", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Delete)(':id/attachments/:attachmentId'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('attachmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "removeAttachment", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Post)('bulk/status'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "bulkStatus", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Post)('bulk/assign'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "bulkAssign", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Post)('bulk/delete'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "bulkDelete", null);
__decorate([
    (0, common_1.Get)('templates/list'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "listTemplates", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Post)('templates'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "createTemplate", null);
__decorate([
    (0, business_only_decorator_1.BusinessOnly)(),
    (0, common_1.Delete)('templates/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "deleteTemplate", null);
__decorate([
    (0, common_1.Post)(':id/time'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "addTimeEntry", null);
__decorate([
    (0, common_1.Get)(':id/time'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "getTimeEntries", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('inbound-email'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-api-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TicketsController.prototype, "inboundEmail", null);
exports.TicketsController = TicketsController = __decorate([
    (0, common_1.Controller)('tickets'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard, business_only_guard_1.BusinessOnlyGuard),
    __metadata("design:paramtypes", [tickets_service_1.TicketsService,
        ticket_timeline_service_1.TicketTimelineService,
        ticket_export_service_1.TicketExportService,
        prisma_service_1.PrismaService])
], TicketsController);
//# sourceMappingURL=tickets.controller.js.map