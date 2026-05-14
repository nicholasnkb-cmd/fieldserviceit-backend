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
exports.WorkflowService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
let WorkflowService = class WorkflowService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto, companyId) {
        const workflow = await this.prisma.workflow.create({
            data: {
                name: dto.name,
                description: dto.description,
                triggerOn: dto.triggerOn || 'ticket.created',
                companyId,
                steps: {
                    create: dto.steps.map((step, index) => ({
                        stepOrder: index + 1,
                        action: step.action,
                        config: step.config || {},
                    })),
                },
            },
            include: { steps: { orderBy: { stepOrder: 'asc' } } },
        });
        return workflow;
    }
    async findAll(companyId) {
        return this.prisma.workflow.findMany({
            where: { companyId, deletedAt: null },
            include: { steps: { orderBy: { stepOrder: 'asc' } } },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id, companyId) {
        const workflow = await this.prisma.workflow.findFirst({
            where: { id, companyId, deletedAt: null },
            include: { steps: { orderBy: { stepOrder: 'asc' } }, runs: { take: 10, orderBy: { startedAt: 'desc' } } },
        });
        if (!workflow)
            throw new common_1.NotFoundException('Workflow not found');
        return workflow;
    }
    async execute(workflowId, ticketId, companyId) {
        const workflow = await this.findOne(workflowId, companyId);
        if (!workflow.isActive)
            throw new Error('Workflow is not active');
        const run = await this.prisma.workflowRun.create({
            data: {
                workflowId,
                ticketId,
                companyId,
                steps: {
                    create: workflow.steps.map((step) => ({
                        stepId: step.id,
                        status: 'pending',
                    })),
                },
            },
        });
        return run;
    }
    async getRuns(workflowId, companyId) {
        await this.findOne(workflowId, companyId);
        return this.prisma.workflowRun.findMany({
            where: { workflowId },
            orderBy: { startedAt: 'desc' },
            include: { steps: true, ticket: { select: { id: true, ticketNumber: true, title: true } } },
        });
    }
};
exports.WorkflowService = WorkflowService;
exports.WorkflowService = WorkflowService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], WorkflowService);
//# sourceMappingURL=workflow.service.js.map