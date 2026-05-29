import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

type AgentStep = {
  id: string;
  title: string;
  detail: string;
  tool?: string;
  requiresApproval?: boolean;
};

type AgentTool = {
  id: string;
  name: string;
  description: string;
  risk: 'read' | 'write';
};

const tools: AgentTool[] = [
  { id: 'inspect_workspace', name: 'Inspect workspace', description: 'Summarize tickets, assets, and device compliance for the current company.', risk: 'read' },
  { id: 'create_ticket', name: 'Create ticket', description: 'Create a service ticket from the requested goal.', risk: 'write' },
  { id: 'create_mdm_enrollment_token', name: 'Create MDM enrollment token', description: 'Generate a one-day device enrollment token.', risk: 'write' },
  { id: 'device_compliance_report', name: 'Device compliance report', description: 'Report enrolled, unmanaged, stale, and non-compliant device counts.', risk: 'read' },
];

@Injectable()
export class AiAgentService {
  constructor(private prisma: PrismaService) {}

  listTools() {
    return { data: tools };
  }

  async plan(goal: string, user: any) {
    const cleanGoal = this.cleanGoal(goal);
    const steps = this.buildPlan(cleanGoal);
    const snapshot = await this.workspaceSnapshot(user.companyId);

    return {
      goal: cleanGoal,
      mode: process.env.AI_PROVIDER ? 'model-ready' : 'deterministic',
      summary: this.summarizePlan(cleanGoal, steps),
      snapshot,
      steps,
      requiredApprovals: steps.filter((step) => step.requiresApproval).map((step) => step.tool),
    };
  }

  async execute(goal: string, user: any, approvedActions: string[]) {
    const planned = await this.plan(goal, user);
    const approved = new Set(approvedActions);
    const results: any[] = [];

    for (const step of planned.steps) {
      if (!step.tool) continue;
      const tool = tools.find((item) => item.id === step.tool);
      if (!tool) continue;
      if (tool.risk === 'write' && !approved.has(tool.id)) {
        results.push({ tool: tool.id, status: 'skipped', message: 'Approval required before this action can run.' });
        continue;
      }
      results.push(await this.runTool(tool.id, planned.goal, user));
    }

    return {
      ...planned,
      results,
      finalAnswer: this.finalAnswer(planned.goal, results),
    };
  }

  private cleanGoal(goal: string) {
    const cleanGoal = String(goal || '').trim();
    if (cleanGoal.length < 4) throw new BadRequestException('Tell the agent what you want done.');
    if (cleanGoal.length > 2000) throw new BadRequestException('Goal is too long. Keep it under 2000 characters.');
    return cleanGoal;
  }

  private buildPlan(goal: string): AgentStep[] {
    const normalized = goal.toLowerCase();
    const steps: AgentStep[] = [
      {
        id: 'understand',
        title: 'Understand the goal',
        detail: 'Classify the request and decide which company-safe tools are needed.',
      },
      {
        id: 'inspect',
        title: 'Inspect current workspace',
        detail: 'Read current ticket, asset, and device-management state before acting.',
        tool: 'inspect_workspace',
      },
    ];

    if (this.matches(normalized, ['ticket', 'issue', 'incident', 'request', 'task'])) {
      steps.push({
        id: 'create-ticket',
        title: 'Create a service ticket',
        detail: 'Open a ticket so the work is trackable by the service team.',
        tool: 'create_ticket',
        requiresApproval: true,
      });
    }

    if (this.matches(normalized, ['enroll', 'mdm', 'device', 'laptop', 'phone', 'tablet', 'token'])) {
      steps.push({
        id: 'mdm-token',
        title: 'Prepare device enrollment',
        detail: 'Generate an MDM enrollment token that can be given to a device agent.',
        tool: 'create_mdm_enrollment_token',
        requiresApproval: true,
      });
    }

    if (this.matches(normalized, ['compliance', 'non-compliant', 'stale', 'security', 'fleet'])) {
      steps.push({
        id: 'compliance',
        title: 'Check device compliance',
        detail: 'Summarize device health and compliance posture.',
        tool: 'device_compliance_report',
      });
    }

    steps.push({
      id: 'report',
      title: 'Report outcome',
      detail: 'Return the result, skipped actions, and recommended next move.',
    });

    return steps;
  }

  private matches(value: string, words: string[]) {
    return words.some((word) => value.includes(word));
  }

  private summarizePlan(goal: string, steps: AgentStep[]) {
    const writeCount = steps.filter((step) => step.requiresApproval).length;
    return `I found ${steps.length} steps for this goal. ${writeCount ? `${writeCount} action${writeCount === 1 ? '' : 's'} need approval before execution.` : 'No write approval is needed.'}`;
  }

  private async runTool(toolId: string, goal: string, user: any) {
    if (toolId === 'inspect_workspace') return this.inspectWorkspace(user.companyId);
    if (toolId === 'create_ticket') return this.createTicket(goal, user);
    if (toolId === 'create_mdm_enrollment_token') return this.createMdmEnrollmentToken(user);
    if (toolId === 'device_compliance_report') return this.deviceComplianceReport(user.companyId);
    return { tool: toolId, status: 'unknown' };
  }

  private async workspaceSnapshot(companyId?: string) {
    if (!companyId) return { tickets: 0, assets: 0, openTickets: 0, enrolledDevices: 0 };
    const [tickets, assets, openTickets, enrolledDevices] = await Promise.all([
      this.prisma.ticket.count({ where: { companyId, deletedAt: null } }),
      this.prisma.asset.count({ where: { companyId, deletedAt: null } }),
      this.prisma.ticket.count({ where: { companyId, deletedAt: null, status: 'OPEN' } }),
      this.prisma.asset.count({ where: { companyId, deletedAt: null, enrollmentStatus: 'ENROLLED' } }),
    ]);
    return { tickets, assets, openTickets, enrolledDevices };
  }

  private async inspectWorkspace(companyId?: string) {
    return {
      tool: 'inspect_workspace',
      status: 'completed',
      data: await this.workspaceSnapshot(companyId),
    };
  }

  private async createTicket(goal: string, user: any) {
    if (!user.companyId) {
      return { tool: 'create_ticket', status: 'skipped', message: 'A company context is required to create tickets.' };
    }
    const ticketNumber = `AI-${Date.now().toString().slice(-6)}`;
    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNumber,
        title: this.goalTitle(goal),
        description: `Created by AI Agent from goal:\n${goal}`,
        contactName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        contactEmail: user.email,
        category: 'AI Agent',
        subcategory: 'Assisted task',
        status: 'OPEN',
        priority: 'MEDIUM',
        type: 'REQUEST',
        companyId: user.companyId,
        createdById: user.id,
      },
    });
    return { tool: 'create_ticket', status: 'completed', data: { id: ticket.id, ticketNumber, title: ticket.title } };
  }

  private async createMdmEnrollmentToken(user: any) {
    if (!user.companyId) {
      return { tool: 'create_mdm_enrollment_token', status: 'skipped', message: 'A company context is required to create MDM tokens.' };
    }

    const id = `mdm-token-${Date.now()}`;
    const token = `mdm_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.execute(
      `INSERT INTO MdmEnrollmentToken (id, companyId, token, deviceCategory, ownership, policyProfile, expiresAt, createdAt)
       VALUES (?, ?, ?, 'LAPTOP', 'COMPANY', 'Baseline', ?, ?)`,
      [id, user.companyId, token, expiresAt, new Date()],
    );
    return { tool: 'create_mdm_enrollment_token', status: 'completed', data: { id, token, expiresAt } };
  }

  private async deviceComplianceReport(companyId?: string) {
    if (!companyId) return { tool: 'device_compliance_report', status: 'skipped', message: 'A company context is required.' };
    const where = { companyId, deletedAt: null };
    const [total, enrolled, nonCompliant, stale, unmanaged] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.count({ where: { ...where, enrollmentStatus: 'ENROLLED' } }),
      this.prisma.asset.count({ where: { ...where, complianceStatus: 'NON_COMPLIANT' } }),
      this.prisma.asset.count({ where: { ...where, enrollmentStatus: 'STALE' } }),
      this.prisma.asset.count({ where: { ...where, enrollmentStatus: 'UNMANAGED' } }),
    ]);
    return {
      tool: 'device_compliance_report',
      status: 'completed',
      data: { total, enrolled, nonCompliant, stale, unmanaged, complianceRate: enrolled ? Math.round(((enrolled - nonCompliant) / enrolled) * 100) : 0 },
    };
  }

  private goalTitle(goal: string) {
    const title = goal.replace(/\s+/g, ' ').trim();
    return title.length > 90 ? `${title.slice(0, 87)}...` : title;
  }

  private finalAnswer(goal: string, results: any[]) {
    const completed = results.filter((result) => result.status === 'completed').length;
    const skipped = results.filter((result) => result.status === 'skipped').length;
    return `Goal handled: "${this.goalTitle(goal)}". Completed ${completed} tool action${completed === 1 ? '' : 's'}${skipped ? ` and skipped ${skipped} action${skipped === 1 ? '' : 's'} pending approval or context` : ''}.`;
  }
}
