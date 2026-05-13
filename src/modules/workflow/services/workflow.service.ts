import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class WorkflowService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async create(dto: { name: string; description?: string; triggerOn?: string; steps: any[] }, companyId: string) {
    const workflow = await this.prisma.workflow.create({
      data: {
        name: dto.name,
        description: dto.description,
        triggerOn: dto.triggerOn || 'ticket.created',
        companyId,
        steps: {
          create: dto.steps.map((step: any, index: number) => ({
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

  async findAll(companyId: string) {
    return this.prisma.workflow.findMany({
      where: { companyId, deletedAt: null },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { steps: { orderBy: { stepOrder: 'asc' } }, runs: { take: 10, orderBy: { startedAt: 'desc' } } },
    });

    if (!workflow) throw new NotFoundException('Workflow not found');
    return workflow;
  }

  async execute(workflowId: string, ticketId: string, companyId: string) {
    const workflow = await this.findOne(workflowId, companyId);
    if (!workflow.isActive) throw new Error('Workflow is not active');

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

  async getRuns(workflowId: string, companyId: string) {
    await this.findOne(workflowId, companyId);
    return this.prisma.workflowRun.findMany({
      where: { workflowId },
      orderBy: { startedAt: 'desc' },
      include: { steps: true, ticket: { select: { id: true, ticketNumber: true, title: true } } },
    });
  }
}
