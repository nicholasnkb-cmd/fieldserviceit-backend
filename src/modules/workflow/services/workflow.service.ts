import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { safeJson, TenantCustomization } from '../../settings/tenant-customization';

@Injectable()
export class WorkflowService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async create(dto: { name: string; description?: string; triggerOn?: string; steps: any[] }, companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { settings: true } });
    const settings = safeJson<Record<string, any>>(company?.settings, {});
    const preferences = (settings.customization as TenantCustomization | undefined)?.workflow;
    const steps = [...(dto.steps || [])];
    const defaultSteps: any[] = [];
    if (preferences?.requireApproval && !steps.some((step: any) => step.action === 'require_approval')) {
      defaultSteps.push({
        action: 'require_approval',
        config: { group: preferences.approvalGroup || 'Tenant administrators' },
      });
    }
    if (preferences?.defaultPriority && !steps.some((step: any) => step.action === 'set_priority')) {
      defaultSteps.push({ action: 'set_priority', config: { priority: preferences.defaultPriority } });
    }
    if (preferences?.autoAssign && !steps.some((step: any) => step.action === 'auto_assign')) {
      defaultSteps.push({ action: 'auto_assign', config: { strategy: 'least_loaded' } });
    }
    steps.unshift(...defaultSteps);
    const workflow = await this.prisma.workflow.create({
      data: {
        name: dto.name,
        description: dto.description,
        triggerOn: dto.triggerOn || preferences?.defaultTrigger || 'ticket.created',
        companyId,
        steps: {
          create: steps.map((step: any, index: number) => ({
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
          create: workflow.steps.map((step: any) => ({
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
