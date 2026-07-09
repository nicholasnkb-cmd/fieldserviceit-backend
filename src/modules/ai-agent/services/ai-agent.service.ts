import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import { TicketParticipantNotifierService } from '../../tickets/services/ticket-participant-notifier.service';
import { AgentHistoryItem, AiModelService, ModelAnalysis } from './ai-model.service';

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

type AgentRecommendation = {
  id: string;
  label: string;
  prompt: string;
  reason: string;
  actionType: 'ask' | 'plan' | 'navigate';
  confidence: 'high' | 'review';
  href?: string;
};

type AgentIntent = {
  primary: string;
  secondary: string[];
  confidence: number;
  entities: {
    status?: string;
    priority?: string;
    ticketNumber?: string;
    email?: string;
    query?: string;
  };
};

const tools: AgentTool[] = [
  { id: 'inspect_workspace', name: 'Inspect workspace', description: 'Summarize tickets, assets, network, RMM, and device compliance for the active scope.', risk: 'read' },
  { id: 'search_tickets', name: 'Search tickets', description: 'Find relevant tickets by number, title, description, contact email, status, and priority.', risk: 'read' },
  { id: 'summarize_ticket_backlog', name: 'Summarize ticket backlog', description: 'Break down ticket load by status and priority, including the oldest unresolved tickets.', risk: 'read' },
  { id: 'search_assets', name: 'Search assets', description: 'Find devices/assets by name, serial, IP, MAC, model, manufacturer, or location.', risk: 'read' },
  { id: 'device_compliance_report', name: 'Device compliance report', description: 'Report enrolled, unmanaged, stale, and non-compliant device counts.', risk: 'read' },
  { id: 'network_health_report', name: 'Network health report', description: 'Summarize monitored network devices, active alerts, recent snapshots, and syslog volume.', risk: 'read' },
  { id: 'rmm_summary', name: 'RMM summary', description: 'Summarize configured RMM providers and recent sync health.', risk: 'read' },
  { id: 'create_ticket', name: 'Create ticket', description: 'Create a service ticket from the requested goal.', risk: 'write' },
  { id: 'create_mdm_enrollment_token', name: 'Create MDM enrollment token', description: 'Generate a one-day device enrollment token.', risk: 'write' },
];

@Injectable()
export class AiAgentService {
  constructor(
    private prisma: PrismaService,
    private participantNotifier: TicketParticipantNotifierService,
    private aiModel: AiModelService,
  ) {}

  listTools() {
    return { data: tools };
  }

  async plan(goal: string, user: any, history: AgentHistoryItem[] = [], currentPage?: string) {
    const cleanGoal = this.contextualizeGoal(this.enrichGoalWithPage(this.cleanGoal(goal), currentPage), history);
    const snapshot = await this.workspaceSnapshot(user);
    const modelAnalysis = await this.aiModel.analyze(cleanGoal, snapshot, history);
    const intent = modelAnalysis ? this.intentFromModel(modelAnalysis.data) : this.classifyIntent(cleanGoal);
    const readTools = modelAnalysis?.data.readTools;
    const steps = this.buildPlan(cleanGoal, intent, readTools);
    const descriptor = modelAnalysis
      ? { provider: modelAnalysis.provider, model: modelAnalysis.model, status: 'completed' }
      : { ...this.aiModel.descriptor(), status: this.aiModel.isConfigured() ? 'fallback' : 'not-configured' };

    return {
      goal: cleanGoal,
      mode: modelAnalysis ? 'model-assisted' : 'deterministic',
      model: descriptor,
      intent,
      summary: modelAnalysis?.data.summary || this.summarizePlan(steps, intent),
      contextNotes: this.contextNotes(user),
      snapshot,
      steps,
      requiredApprovals: [...new Set(steps.filter((step) => step.requiresApproval).map((step) => step.tool).filter(Boolean))],
      suggestedActions: modelAnalysis?.data.suggestedActions?.length ? modelAnalysis.data.suggestedActions : this.suggestedActions(intent),
      recommendations: this.buildRecommendations(intent, snapshot, [], currentPage),
      riskSummary: this.riskSummary(steps),
    };
  }

  async ask(question: string, user: any, history: AgentHistoryItem[] = [], currentPage?: string) {
    const cleanQuestion = this.contextualizeGoal(this.enrichGoalWithPage(this.cleanGoal(question), currentPage), history);
    const snapshot = await this.workspaceSnapshot(user);
    const modelAnalysis = await this.aiModel.analyze(cleanQuestion, snapshot, history);
    const intent = modelAnalysis ? this.intentFromModel(modelAnalysis.data) : this.classifyIntent(cleanQuestion);
    const toolIds = this.allowedReadTools(modelAnalysis?.data.readTools || this.readToolsForIntent(intent));
    const results = [];

    for (const toolId of toolIds) {
      results.push(await this.runTool(toolId, cleanQuestion, user, intent));
    }
    const synthesis = modelAnalysis
      ? await this.aiModel.synthesize(cleanQuestion, modelAnalysis.data, snapshot, results, history)
      : null;
    const descriptor = synthesis || modelAnalysis;

    return {
      question: cleanQuestion,
      mode: descriptor ? 'model-assisted' : 'deterministic',
      model: descriptor
        ? { provider: descriptor.provider, model: descriptor.model, status: synthesis ? 'completed' : 'analysis-only' }
        : { ...this.aiModel.descriptor(), status: this.aiModel.isConfigured() ? 'fallback' : 'not-configured' },
      intent,
      answer: synthesis?.data.answer || this.answerFromResults(cleanQuestion, intent, snapshot, results),
      facts: synthesis?.data.facts?.length ? synthesis.data.facts : this.factsFromResults(snapshot, results),
      suggestedActions: synthesis?.data.suggestedActions?.length
        ? synthesis.data.suggestedActions
        : modelAnalysis?.data.suggestedActions?.length
          ? modelAnalysis.data.suggestedActions
          : this.suggestedActions(intent),
      recommendations: this.buildRecommendations(intent, snapshot, results, currentPage),
      contextNotes: this.contextNotes(user),
      snapshot,
      results,
    };
  }

  async execute(goal: string, user: any, approvedActions: string[], history: AgentHistoryItem[] = [], currentPage?: string) {
    const planned = await this.plan(goal, user, history, currentPage);
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
      results.push(await this.runTool(tool.id, planned.goal, user, planned.intent));
    }

    return {
      ...planned,
      results,
      recommendations: this.buildRecommendations(planned.intent, planned.snapshot, results, currentPage),
      finalAnswer: this.finalAnswer(planned.goal, results),
    };
  }

  private cleanGoal(goal: string) {
    const cleanGoal = String(goal || '').trim();
    if (cleanGoal.length < 4) throw new BadRequestException('Tell the agent what you want done.');
    if (cleanGoal.length > 2000) throw new BadRequestException('Goal is too long. Keep it under 2000 characters.');
    return cleanGoal;
  }

  private contextualizeGoal(goal: string, history: AgentHistoryItem[]) {
    const previousUserGoal = [...(Array.isArray(history) ? history : [])]
      .reverse()
      .find((item) => item?.role === 'user' && typeof item.content === 'string')?.content?.trim();
    if (!previousUserGoal) return goal;

    const normalized = goal.toLowerCase();
    const looksLikeFollowUp = (
      goal.length < 120
      || /^(what about|show me|summarize|then|also|and|which|who|why|how about)\b/i.test(goal)
      || /\b(those|that|them|it|same|oldest|newest|highest|critical ones|open ones)\b/i.test(goal)
    );
    const hasExplicitDomain = this.matches(normalized, [
      'ticket', 'asset', 'device', 'network', 'rmm', 'sync', 'compliance', 'enroll', 'mdm', 'alert',
    ]);
    if (!looksLikeFollowUp || hasExplicitDomain) return goal;

    return `${goal}\n\nConversation context: the previous user request was "${previousUserGoal.slice(0, 300)}".`;
  }

  private enrichGoalWithPage(goal: string, currentPage?: string) {
    if (!currentPage || !this.matches(goal.toLowerCase(), ['this page', 'this board', 'this list', 'current page', 'current board', 'here'])) {
      return goal;
    }

    const page = currentPage.toLowerCase();
    const context = page.includes('/tickets/board')
      ? 'Current page context: ticket board.'
      : page.includes('/tickets')
        ? 'Current page context: tickets list.'
        : page.includes('/assets')
          ? 'Current page context: asset inventory.'
          : page.includes('/network')
            ? 'Current page context: network monitoring.'
            : page.includes('/rmm')
              ? 'Current page context: RMM integrations.'
              : page.includes('/ai-agent')
                ? 'Current page context: AI operations assistant.'
                : '';
    return context ? `${goal}\n\n${context}` : goal;
  }

  private classifyIntent(goal: string): AgentIntent {
    const normalized = goal.toLowerCase();
    const scores: Record<string, number> = {
      ticket: this.score(normalized, ['ticket', 'incident', 'request', 'case', 'issue', 'backlog', 'sla', 'board']),
      asset: this.score(normalized, ['asset', 'device', 'laptop', 'desktop', 'phone', 'serial', 'inventory', 'workstation', 'endpoint']),
      compliance: this.score(normalized, ['compliance', 'non-compliant', 'stale', 'security', 'unmanaged', 'fleet', 'risk', 'missing', 'outdated']),
      network: this.score(normalized, ['network', 'router', 'switch', 'firewall', 'ap', 'wan', 'port', 'syslog', 'snmp', 'latency', 'packet loss', 'offline', 'down', 'outage']),
      rmm: this.score(normalized, ['rmm', 'sync', 'ninja', 'datto', 'connectwise', 'integration', 'provider', 'atera', 'nable', 'kaseya', 'syncro']),
      enrollment: this.score(normalized, ['enroll', 'mdm', 'token', 'onboard', 'provision', 'join']),
    };
    const priority = ['network', 'rmm', 'compliance', 'enrollment', 'ticket', 'asset'];
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1] || priority.indexOf(a[0]) - priority.indexOf(b[0]));
    const primary = ranked[0][1] > 0 ? ranked[0][0] : 'general';
    const status = this.extractStatus(normalized);
    const priorityEntity = this.extractPriority(normalized);
    const ticketNumber = goal.match(/\b(?:TKT|AI)-[A-Z0-9-]+\b/i)?.[0]?.toUpperCase();
    const email = goal.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase();

    return {
      primary,
      secondary: ranked.filter(([name, value]) => name !== primary && value > 0).slice(0, 3).map(([name]) => name),
      confidence: Math.min(95, Math.max(45, 45 + ranked[0][1] * 12)),
      entities: {
        status,
        priority: priorityEntity,
        ticketNumber,
        email,
        query: this.queryTerm(goal, ticketNumber, email),
      },
    };
  }

  private score(value: string, words: string[]) {
    return words.reduce((total, word) => total + (value.includes(word) ? 1 : 0), 0);
  }

  private extractStatus(value: string) {
    if (value.includes('in progress')) return 'IN_PROGRESS';
    if (value.includes('on hold')) return 'ON_HOLD';
    if (value.includes('assigned')) return 'ASSIGNED';
    if (value.includes('resolved')) return 'RESOLVED';
    if (value.includes('closed')) return 'CLOSED';
    if (value.includes('open')) return 'OPEN';
    return undefined;
  }

  private extractPriority(value: string) {
    if (value.includes('critical')) return 'CRITICAL';
    if (value.includes('high') || value.includes('urgent') || value.includes('asap') || value.includes('priority')) return 'HIGH';
    if (value.includes('medium')) return 'MEDIUM';
    if (value.includes('low')) return 'LOW';
    return undefined;
  }

  private queryTerm(goal: string, ticketNumber?: string, email?: string) {
    if (ticketNumber) return ticketNumber;
    if (email) return email;
    return goal
      .replace(/\b(show|find|search|list|summarize|summary|what|which|are|the|all|my|for|about|please|ticket|tickets|asset|assets|device|devices)\b/gi, ' ')
      .replace(/conversation context:.*$/is, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private buildPlan(goal: string, intent: AgentIntent, selectedReadTools?: string[]): AgentStep[] {
    const steps: AgentStep[] = [
      {
        id: 'understand',
        title: 'Classify request',
        detail: `Intent: ${intent.primary} (${intent.confidence}% confidence). Extracted status, priority, ticket number, email, and search terms where present.`,
      },
      {
        id: 'inspect',
        title: 'Inspect current workspace',
        detail: 'Read current ticket, asset, network, RMM, and device-management state before acting.',
        tool: 'inspect_workspace',
      },
    ];

    for (const toolId of this.allowedReadTools(selectedReadTools || this.readToolsForIntent(intent))) {
      if (toolId === 'inspect_workspace') continue;
      const tool = tools.find((item) => item.id === toolId);
      if (tool) {
        steps.push({
          id: toolId,
          title: tool.name,
          detail: tool.description,
          tool: tool.id,
        });
      }
    }

    if (this.shouldCreateTicket(goal, intent)) {
      steps.push({
        id: 'create-ticket',
        title: 'Create a service ticket',
        detail: 'Open a ticket so the work is trackable by the service team.',
        tool: 'create_ticket',
        requiresApproval: true,
      });
    }

    if (this.shouldCreateEnrollmentToken(goal, intent)) {
      steps.push({
        id: 'mdm-token',
        title: 'Prepare device enrollment',
        detail: 'Generate an MDM enrollment token that can be given to a device agent.',
        tool: 'create_mdm_enrollment_token',
        requiresApproval: true,
      });
    }

    steps.push({
      id: 'report',
      title: 'Report outcome',
      detail: 'Return findings, skipped actions, approvals needed, and recommended next moves.',
    });

    return steps;
  }

  private readToolsForIntent(intent: AgentIntent) {
    const toolIds = new Set<string>(['inspect_workspace']);
    const intents = new Set([intent.primary, ...(intent.secondary || [])]);
    if (intents.has('ticket') || intents.has('general')) {
      toolIds.add('search_tickets');
      toolIds.add('summarize_ticket_backlog');
    }
    if (['asset', 'compliance', 'enrollment', 'general'].some((name) => intents.has(name))) {
      toolIds.add('search_assets');
    }
    if (['compliance', 'asset', 'enrollment'].some((name) => intents.has(name))) {
      toolIds.add('device_compliance_report');
    }
    if (intents.has('network') || intents.has('general')) toolIds.add('network_health_report');
    if (intents.has('rmm') || intents.has('general')) toolIds.add('rmm_summary');
    if (intents.has('general')) toolIds.add('device_compliance_report');
    return [...toolIds];
  }

  private allowedReadTools(toolIds: string[]) {
    const allowed = new Set(tools.filter((tool) => tool.risk === 'read').map((tool) => tool.id));
    return [...new Set(toolIds)].filter((toolId) => allowed.has(toolId));
  }

  private intentFromModel(analysis: ModelAnalysis): AgentIntent {
    return {
      primary: analysis.primaryIntent,
      secondary: analysis.secondaryIntents,
      confidence: analysis.confidence,
      entities: {
        status: analysis.status || undefined,
        priority: analysis.priority || undefined,
        ticketNumber: analysis.ticketNumber || undefined,
        email: analysis.email || undefined,
        query: analysis.query || undefined,
      },
    };
  }

  private shouldCreateTicket(goal: string, intent: AgentIntent) {
    const normalized = goal.toLowerCase();
    return this.matches(normalized, ['ticket', 'incident', 'request', 'case', 'issue']) && this.matches(normalized, ['create', 'open', 'make', 'new', 'log']);
  }

  private shouldCreateEnrollmentToken(goal: string, intent: AgentIntent) {
    const normalized = goal.toLowerCase();
    return intent.primary === 'enrollment' || (this.matches(normalized, ['enroll', 'mdm', 'token']) && this.matches(normalized, ['create', 'generate', 'new']));
  }

  private matches(value: string, words: string[]) {
    return words.some((word) => value.includes(word));
  }

  private summarizePlan(steps: AgentStep[], intent: AgentIntent) {
    const writeCount = steps.filter((step) => step.requiresApproval).length;
    return `I classified this as ${intent.primary} work with ${intent.confidence}% confidence and found ${steps.length} steps. ${writeCount ? `${writeCount} write action${writeCount === 1 ? '' : 's'} need approval.` : 'No write approval is needed.'}`;
  }

  private riskSummary(steps: AgentStep[]) {
    const writeTools = steps.filter((step) => step.requiresApproval && step.tool).map((step) => step.tool);
    return writeTools.length
      ? `Read-only checks can run immediately. Write tools require explicit approval: ${writeTools.join(', ')}.`
      : 'This plan only uses read-only tools.';
  }

  private suggestedActions(intent: AgentIntent) {
    const suggestions: Record<string, string[]> = {
      ticket: ['Review oldest unresolved tickets', 'Search for similar tickets before opening a duplicate', 'Create a ticket if work needs tracking'],
      asset: ['Search inventory by serial/IP/location', 'Check compliance for matching devices', 'Review device assignment and last check-in'],
      compliance: ['Review unmanaged and stale devices', 'Create remediation tickets for non-compliant assets', 'Generate enrollment tokens for new devices'],
      network: ['Review active network alerts', 'Check newest interface and health snapshots', 'Open a ticket for recurring outages'],
      rmm: ['Review active provider configs', 'Check recent sync failures', 'Run a provider sync from the integration page'],
      enrollment: ['Generate an enrollment token after approval', 'Confirm ownership and policy profile', 'Create a follow-up ticket for the technician'],
      general: ['Ask about tickets, assets, network health, RMM sync, compliance, or enrollment', 'Create a plan when you want the agent to act'],
    };
    return suggestions[intent.primary] || suggestions.general;
  }

  private async runTool(toolId: string, goal: string, user: any, intent: AgentIntent) {
    if (toolId === 'inspect_workspace') return this.inspectWorkspace(user);
    if (toolId === 'search_tickets') return this.searchTickets(user, intent);
    if (toolId === 'summarize_ticket_backlog') return this.summarizeTicketBacklog(user);
    if (toolId === 'search_assets') return this.searchAssets(user, intent);
    if (toolId === 'create_ticket') return this.createTicket(goal, user, intent);
    if (toolId === 'create_mdm_enrollment_token') return this.createMdmEnrollmentToken(user);
    if (toolId === 'device_compliance_report') return this.deviceComplianceReport(user);
    if (toolId === 'network_health_report') return this.networkHealthReport(user);
    if (toolId === 'rmm_summary') return this.rmmSummary(user);
    return { tool: toolId, status: 'unknown' };
  }

  private async workspaceSnapshot(user: any) {
    const ticketValues: any[] = [];
    const assetValues: any[] = [];
    const rmmValues: any[] = [];
    const networkValues: any[] = [];
    const ticketScope = this.ticketScopeSql('t', user, ticketValues);
    const assetScope = this.companyScopeSql('a', user, assetValues);
    const rmmScope = this.companyScopeSql('r', user, rmmValues);
    const networkScope = this.companyScopeSql('e', user, networkValues);

    const [tickets, openTickets, assets, enrolledDevices, activeNetworkAlerts, rmmProviders] = await Promise.all([
      this.countSql(`SELECT COUNT(*) as count FROM Ticket t WHERE t.deletedAt IS NULL AND ${ticketScope}`, ticketValues),
      this.countSql(`SELECT COUNT(*) as count FROM Ticket t WHERE t.deletedAt IS NULL AND t.status = 'OPEN' AND ${ticketScope}`, ticketValues),
      this.countSql(`SELECT COUNT(*) as count FROM Asset a WHERE a.deletedAt IS NULL AND ${assetScope}`, assetValues),
      this.countSql(`SELECT COUNT(*) as count FROM Asset a WHERE a.deletedAt IS NULL AND a.enrollmentStatus = 'ENROLLED' AND ${assetScope}`, assetValues),
      this.countSql(`SELECT COUNT(*) as count FROM NetworkAlertEvent e WHERE e.status = 'ACTIVE' AND ${networkScope}`, networkValues).catch(() => 0),
      this.countSql(`SELECT COUNT(*) as count FROM RmmProviderConfig r WHERE r.isActive = 1 AND ${rmmScope}`, rmmValues).catch(() => 0),
    ]);
    return { tickets, openTickets, assets, enrolledDevices, activeNetworkAlerts, rmmProviders };
  }

  private async inspectWorkspace(user: any) {
    return {
      tool: 'inspect_workspace',
      status: 'completed',
      data: await this.workspaceSnapshot(user),
    };
  }

  private async searchTickets(user: any, intent: AgentIntent) {
    const values: any[] = [];
    const clauses = ['t.deletedAt IS NULL', this.ticketScopeSql('t', user, values)];
    if (intent.entities.status) {
      clauses.push('t.status = ?');
      values.push(intent.entities.status);
    }
    if (intent.entities.priority) {
      clauses.push('t.priority = ?');
      values.push(intent.entities.priority);
    }
    const query = intent.entities.query;
    if (query && query.length > 1) {
      clauses.push('(t.title LIKE ? OR t.ticketNumber LIKE ? OR t.description LIKE ? OR t.contactEmail LIKE ?)');
      values.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }
    const rows = await this.prisma.query<any[]>(
      `SELECT t.id, t.ticketNumber, t.title, t.status, t.priority, t.category, t.contactEmail, t.createdAt
       FROM Ticket t
       WHERE ${clauses.join(' AND ')}
       ORDER BY t.createdAt DESC
       LIMIT 10`,
      values,
    );
    return { tool: 'search_tickets', status: 'completed', data: { count: rows.length, items: rows } };
  }

  private async summarizeTicketBacklog(user: any) {
    const statusValues: any[] = [];
    const priorityValues: any[] = [];
    const oldestValues: any[] = [];
    const statusScope = this.ticketScopeSql('t', user, statusValues);
    const priorityScope = this.ticketScopeSql('t', user, priorityValues);
    const oldestScope = this.ticketScopeSql('t', user, oldestValues);
    const [byStatus, byPriority, oldestOpen] = await Promise.all([
      this.prisma.query<any[]>(`SELECT t.status, COUNT(*) as count FROM Ticket t WHERE t.deletedAt IS NULL AND ${statusScope} GROUP BY t.status`, statusValues),
      this.prisma.query<any[]>(`SELECT t.priority, COUNT(*) as count FROM Ticket t WHERE t.deletedAt IS NULL AND ${priorityScope} GROUP BY t.priority`, priorityValues),
      this.prisma.query<any[]>(
        `SELECT t.id, t.ticketNumber, t.title, t.status, t.priority, t.createdAt
         FROM Ticket t
         WHERE t.deletedAt IS NULL AND t.status NOT IN ('RESOLVED', 'CLOSED') AND ${oldestScope}
         ORDER BY t.createdAt ASC
         LIMIT 5`,
        oldestValues,
      ),
    ]);
    return { tool: 'summarize_ticket_backlog', status: 'completed', data: { byStatus, byPriority, oldestOpen } };
  }

  private async searchAssets(user: any, intent: AgentIntent) {
    const values: any[] = [];
    const scope = this.companyScopeSql('a', user, values);
    if (scope === '1=0') return { tool: 'search_assets', status: 'skipped', message: 'A company context is required to search assets.' };
    const clauses = ['a.deletedAt IS NULL', scope];
    const query = intent.entities.query;
    if (query && query.length > 1) {
      clauses.push('(a.name LIKE ? OR a.serialNumber LIKE ? OR a.ipAddress LIKE ? OR a.macAddress LIKE ? OR a.model LIKE ? OR a.manufacturer LIKE ? OR a.location LIKE ?)');
      values.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
    }
    const rows = await this.prisma.query<any[]>(
      `SELECT a.id, a.name, a.assetType, a.serialNumber, a.manufacturer, a.model, a.ipAddress, a.location, a.status, a.enrollmentStatus, a.complianceStatus, a.lastCheckInAt
       FROM Asset a
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.updatedAt DESC
       LIMIT 10`,
      values,
    );
    return { tool: 'search_assets', status: 'completed', data: { count: rows.length, items: rows } };
  }

  private async createTicket(goal: string, user: any, intent: AgentIntent) {
    if (!user.companyId) {
      return { tool: 'create_ticket', status: 'skipped', message: 'A company context is required to create tickets.' };
    }
    const countRows = await this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM Ticket WHERE companyId = ?`, [user.companyId]);
    const ticketNumber = await this.nextTicketNumber(`TKT-${user.companyId.slice(0, 4).toUpperCase()}`, Number(countRows[0]?.count || 0));
    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNumber,
        title: this.goalTitle(goal),
        description: `Created by AI Agent from goal:\n${goal}\n\nDetected intent: ${intent.primary}`,
        contactName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        contactEmail: user.email,
        contactPhone: user.phone || 'N/A',
        category: 'AI Agent',
        subcategory: intent.primary,
        status: 'OPEN',
        priority: intent.entities.priority || 'MEDIUM',
        type: 'REQUEST',
        companyId: user.companyId,
        createdById: user.id,
      },
    });
    await this.participantNotifier.notify(ticket.id, {
      action: 'Ticket opened by AI Agent',
      detail: this.goalTitle(goal),
      actorId: user.id,
    });
    return { tool: 'create_ticket', status: 'completed', data: { id: ticket.id, ticketNumber, title: ticket.title, link: `/tickets/${ticket.id}` } };
  }

  private async nextTicketNumber(prefix: string, startingCount: number) {
    let next = startingCount + 1;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const ticketNumber = `${prefix}-${next.toString().padStart(5, '0')}`;
      const existing = await this.prisma.ticket.findFirst({ where: { ticketNumber }, select: { id: true } });
      if (!existing) return ticketNumber;
      next += 1;
    }
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }

  private async createMdmEnrollmentToken(user: any) {
    if (!user.companyId) {
      return { tool: 'create_mdm_enrollment_token', status: 'skipped', message: 'A company context is required to create MDM tokens.' };
    }

    const id = `mdm-token-${crypto.randomUUID()}`;
    const token = `mdm_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.execute(
      `INSERT INTO MdmEnrollmentToken (id, companyId, token, deviceCategory, ownership, policyProfile, expiresAt, createdAt)
       VALUES (?, ?, ?, 'LAPTOP', 'COMPANY', 'Baseline', ?, ?)`,
      [id, user.companyId, token, expiresAt, new Date()],
    );
    return { tool: 'create_mdm_enrollment_token', status: 'completed', data: { id, token, expiresAt } };
  }

  private async deviceComplianceReport(user: any) {
    const values: any[] = [];
    const scope = this.companyScopeSql('a', user, values);
    if (scope === '1=0') return { tool: 'device_compliance_report', status: 'skipped', message: 'A company context is required.' };
    const where = `a.deletedAt IS NULL AND ${scope}`;
    const [total, enrolled, nonCompliant, stale, unmanaged] = await Promise.all([
      this.countSql(`SELECT COUNT(*) as count FROM Asset a WHERE ${where}`, values),
      this.countSql(`SELECT COUNT(*) as count FROM Asset a WHERE ${where} AND a.enrollmentStatus = 'ENROLLED'`, values),
      this.countSql(`SELECT COUNT(*) as count FROM Asset a WHERE ${where} AND a.complianceStatus = 'NON_COMPLIANT'`, values),
      this.countSql(`SELECT COUNT(*) as count FROM Asset a WHERE ${where} AND a.enrollmentStatus = 'STALE'`, values),
      this.countSql(`SELECT COUNT(*) as count FROM Asset a WHERE ${where} AND a.enrollmentStatus = 'UNMANAGED'`, values),
    ]);
    return {
      tool: 'device_compliance_report',
      status: 'completed',
      data: { total, enrolled, nonCompliant, stale, unmanaged, complianceRate: enrolled ? Math.round(((enrolled - nonCompliant) / enrolled) * 100) : 0 },
    };
  }

  private async networkHealthReport(user: any) {
    const deviceValues: any[] = [];
    const alertValues: any[] = [];
    const snapshotValues: any[] = [];
    const syslogValues: any[] = [];
    const deviceScope = this.companyScopeSql('a', user, deviceValues);
    const alertScope = this.companyScopeSql('e', user, alertValues);
    const snapshotScope = this.companyScopeSql('s', user, snapshotValues);
    const syslogScope = this.companyScopeSql('l', user, syslogValues);
    if (deviceScope === '1=0') return { tool: 'network_health_report', status: 'skipped', message: 'A company context is required.' };

    try {
      const [networkDevices, activeAlerts, recentSnapshots, syslogEvents] = await Promise.all([
        this.countSql(`SELECT COUNT(*) as count FROM Asset a WHERE a.deletedAt IS NULL AND a.assetType = 'NETWORK_DEVICE' AND ${deviceScope}`, deviceValues),
        this.countSql(`SELECT COUNT(*) as count FROM NetworkAlertEvent e WHERE e.status = 'ACTIVE' AND ${alertScope}`, alertValues),
        this.prisma.query<any[]>(
          `SELECT s.status, s.latencyMs, s.packetLossPct, s.cpuPct, s.memoryPct, s.source, s.createdAt
           FROM NetworkHealthSnapshot s
           WHERE ${snapshotScope}
           ORDER BY s.createdAt DESC
           LIMIT 5`,
          snapshotValues,
        ),
        this.countSql(`SELECT COUNT(*) as count FROM NetworkSyslogEvent l WHERE l.receivedAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND ${syslogScope}`, syslogValues),
      ]);
      return { tool: 'network_health_report', status: 'completed', data: { networkDevices, activeAlerts, syslogEvents24h: syslogEvents, recentSnapshots } };
    } catch (err) {
      return { tool: 'network_health_report', status: 'skipped', message: 'Network monitoring tables are not available yet.' };
    }
  }

  private async rmmSummary(user: any) {
    const configValues: any[] = [];
    const syncValues: any[] = [];
    const configScope = this.companyScopeSql('r', user, configValues);
    const syncScope = this.companyScopeSql('s', user, syncValues);
    if (configScope === '1=0') return { tool: 'rmm_summary', status: 'skipped', message: 'A company context is required.' };

    try {
      const [providers, recentSyncs] = await Promise.all([
        this.prisma.query<any[]>(
          `SELECT r.id, r.provider, r.isActive, r.lastSyncAt, r.lastSyncStatus, r.lastTestStatus, r.lastTestAt
           FROM RmmProviderConfig r
           WHERE ${configScope}
           ORDER BY r.updatedAt DESC
           LIMIT 10`,
          configValues,
        ),
        this.prisma.query<any[]>(
          `SELECT s.provider, s.status, s.startedAt, s.completedAt, s.assetsCreated, s.assetsUpdated, s.assetsSkipped, s.errorMessage
           FROM RmmSyncRun s
           WHERE ${syncScope}
           ORDER BY s.startedAt DESC
           LIMIT 10`,
          syncValues,
        ),
      ]);
      return { tool: 'rmm_summary', status: 'completed', data: { providers, recentSyncs } };
    } catch (err) {
      return { tool: 'rmm_summary', status: 'skipped', message: 'RMM tables are not available yet.' };
    }
  }

  private ticketScopeSql(alias: string, user: any, values: any[]) {
    if (user?.role === 'SUPER_ADMIN' && !user.companyId) return '1=1';
    if (user?.userType === 'PUBLIC') {
      values.push(user.id);
      return `${alias}.createdById = ?`;
    }
    if (user?.companyId) {
      values.push(user.companyId);
      return `${alias}.companyId = ?`;
    }
    return '1=0';
  }

  private companyScopeSql(alias: string, user: any, values: any[]) {
    if (user?.role === 'SUPER_ADMIN' && !user.companyId) return '1=1';
    if (user?.companyId) {
      values.push(user.companyId);
      return `${alias}.companyId = ?`;
    }
    return '1=0';
  }

  private async countSql(sql: string, values: any[]) {
    const rows = await this.prisma.query<any[]>(sql, [...values]);
    return Number(rows[0]?.count || 0);
  }

  private contextNotes(user: any) {
    if (user?.role === 'SUPER_ADMIN' && !user.companyId) {
      return ['Super admin global scope is active, so read-only answers can include all tenants. Write actions still require selecting a company context.'];
    }
    if (!user?.companyId) return ['No company context is active, so tenant-scoped tools may be limited.'];
    return ['Tenant scope is active; answers and actions are limited to the selected business.'];
  }

  private answerFromResults(question: string, intent: AgentIntent, snapshot: Record<string, number>, results: any[]) {
    const completed = results.filter((result) => result.status === 'completed');
    const skipped = results.filter((result) => result.status === 'skipped');
    const normalized = question.toLowerCase();
    if (this.matches(normalized, ['hello', 'hi ', 'hey', 'good morning', 'good afternoon'])) {
      return 'Hi. I can help triage the day: tickets, assets, device compliance, network health, RMM syncs, and enrollment work. I can also prepare approved actions such as creating a ticket or enrollment token.';
    }
    if (this.matches(normalized, ['what can you do', 'help me', 'capabilities', 'how do i use', 'what do you do'])) {
      return 'I can search and summarize tickets, find assets, report device compliance, inspect network health, review RMM syncs, and prepare service tickets or MDM enrollment tokens for approval. A good starting point is “Give me a morning briefing” or “Which open tickets need attention first?”';
    }

    const parts: string[] = [];
    const ticketSearch = completed.find((result) => result.tool === 'search_tickets');
    const backlog = completed.find((result) => result.tool === 'summarize_ticket_backlog');
    const assetSearch = completed.find((result) => result.tool === 'search_assets');
    const compliance = completed.find((result) => result.tool === 'device_compliance_report');
    const network = completed.find((result) => result.tool === 'network_health_report');
    const rmm = completed.find((result) => result.tool === 'rmm_summary');

    if (intent.primary === 'ticket' || intent.secondary.includes('ticket') || backlog) {
      if (ticketSearch?.data.count) {
        const items = ticketSearch.data.items.slice(0, 3).map((item: any) => `${item.ticketNumber}: ${item.title} (${item.status}, ${item.priority})`);
        parts.push(`I found ${ticketSearch.data.count} matching ticket${ticketSearch.data.count === 1 ? '' : 's'}: ${items.join('; ')}.`);
      } else if (intent.primary === 'ticket' || intent.secondary.includes('ticket')) {
        parts.push(`I found no tickets matching "${intent.entities.query || question}".`);
      }
      if (backlog?.data.byStatus?.length) {
        const statusText = backlog.data.byStatus.map((row: any) => `${row.status || 'UNKNOWN'} ${row.count}`).join(', ');
        const priorityText = backlog.data.byPriority?.map((row: any) => `${row.priority || 'UNKNOWN'} ${row.count}`).join(', ');
        parts.push(`Backlog by status: ${statusText || 'none'}. Priority mix: ${priorityText || 'none'}.`);
      }
      if (backlog?.data.oldestOpen?.length) {
        const oldest = backlog.data.oldestOpen[0];
        parts.push(`The oldest unresolved ticket is ${oldest.ticketNumber}: ${oldest.title}.`);
      }
    }

    if (intent.primary === 'asset' || intent.secondary.includes('asset') || assetSearch) {
      if (assetSearch?.data.count) {
        const items = assetSearch.data.items.slice(0, 3).map((item: any) => `${item.name} (${item.assetType}, ${item.status})`);
        parts.push(`I found ${assetSearch.data.count} matching asset${assetSearch.data.count === 1 ? '' : 's'}: ${items.join('; ')}.`);
      } else if (intent.primary === 'asset' || intent.secondary.includes('asset')) {
        parts.push(`I found no assets matching "${intent.entities.query || question}".`);
      }
    }

    if (intent.primary === 'compliance' || intent.secondary.includes('compliance') || intent.primary === 'general') {
      if (compliance) {
        parts.push(
          `Device compliance is ${compliance.data.complianceRate}% across ${compliance.data.enrolled} enrolled devices. ` +
          `${compliance.data.nonCompliant} are non-compliant, ${compliance.data.stale} are stale, and ${compliance.data.unmanaged} are unmanaged.`,
        );
      }
    }

    if (intent.primary === 'network' || intent.secondary.includes('network') || intent.primary === 'general') {
      if (network?.status === 'completed') {
        parts.push(
          `The current scope has ${network.data.networkDevices} network devices, ${network.data.activeAlerts} active alerts, ` +
          `and ${network.data.syslogEvents24h} syslog events in the last 24 hours.`,
        );
      } else {
        parts.push(`The current scope has ${snapshot.activeNetworkAlerts} active network alerts.`);
      }
    }

    if (intent.primary === 'rmm' || intent.secondary.includes('rmm') || intent.primary === 'general') {
      if (rmm?.status === 'completed') {
        parts.push(`I found ${rmm.data.providers.length} RMM provider configurations and ${rmm.data.recentSyncs.length} recent sync runs.`);
      } else {
        parts.push(`The current scope has ${snapshot.rmmProviders} active RMM providers.`);
      }
    }

    if (intent.primary === 'enrollment') {
      parts.push(`There are ${snapshot.enrolledDevices} enrolled devices in the current scope. Creating a new enrollment token requires an approved plan.`);
    }

    if (intent.primary === 'general' && parts.length === 0) {
      parts.push(
        `I found ${snapshot.openTickets || 0} open tickets, ${snapshot.assets || 0} assets, ` +
        `${snapshot.enrolledDevices} enrolled devices, ${snapshot.activeNetworkAlerts} active network alerts, and ${snapshot.rmmProviders} active RMM providers. ` +
        'I would start with open work, stale or unmanaged devices, and any active network alerts.',
      );
    }

    if (skipped.length) parts.push(`${skipped.length} tool${skipped.length === 1 ? '' : 's'} could not run because context or tables were unavailable.`);
    return parts.join(' ');
  }

  private buildRecommendations(intent: AgentIntent, snapshot: Record<string, number>, results: any[] = [], currentPage?: string): AgentRecommendation[] {
    const recommendations: AgentRecommendation[] = [];
    const ticketSearch = results.find((result) => result.tool === 'search_tickets' && result.status === 'completed');
    const backlog = results.find((result) => result.tool === 'summarize_ticket_backlog' && result.status === 'completed');
    const assetSearch = results.find((result) => result.tool === 'search_assets' && result.status === 'completed');
    const compliance = results.find((result) => result.tool === 'device_compliance_report' && result.status === 'completed');
    const network = results.find((result) => result.tool === 'network_health_report' && result.status === 'completed');
    const firstTicket = ticketSearch?.data?.items?.[0] || backlog?.data?.oldestOpen?.[0];
    const firstAsset = assetSearch?.data?.items?.[0];
    const page = String(currentPage || '').toLowerCase();

    const add = (item: AgentRecommendation) => {
      if (!recommendations.some((existing) => existing.id === item.id)) recommendations.push(item);
    };

    if (snapshot.openTickets > 0 || firstTicket || page.includes('/tickets')) {
      add({
        id: 'review-open-tickets',
        label: 'Review ticket risks',
        prompt: 'Which open tickets need attention first, and why?',
        reason: `${snapshot.openTickets || 0} open ticket${snapshot.openTickets === 1 ? '' : 's'} ${snapshot.openTickets === 1 ? 'is' : 'are'} in scope.`,
        actionType: 'ask',
        confidence: 'high',
        href: '/tickets/board',
      });
    }

    if (firstTicket?.id) {
      add({
        id: 'open-ticket',
        label: 'Open top ticket',
        prompt: `Open ticket ${firstTicket.ticketNumber}`,
        reason: `${firstTicket.ticketNumber} is the most relevant ticket from the latest evidence.`,
        actionType: 'navigate',
        confidence: 'high',
        href: `/tickets/${firstTicket.id}`,
      });
      add({
        id: 'escalate-ticket',
        label: 'Escalate priority',
        prompt: `Create a plan to escalate ${firstTicket.ticketNumber} if the evidence supports it`,
        reason: `Priority changes should be reviewed against ticket detail before writing.`,
        actionType: 'plan',
        confidence: 'review',
      });
      add({
        id: 'assign-technician',
        label: 'Assign technician',
        prompt: `Create a plan to assign a technician to ${firstTicket.ticketNumber}`,
        reason: `Assignment needs technician availability and ownership review.`,
        actionType: 'plan',
        confidence: 'review',
      });
      add({
        id: 'draft-customer-reply',
        label: 'Draft customer reply',
        prompt: `Draft a customer update for ${firstTicket.ticketNumber} using the ticket evidence`,
        reason: `A quick customer update can reduce follow-up on active work.`,
        actionType: 'ask',
        confidence: 'review',
      });
    } else if (['general', 'ticket', 'network', 'compliance'].includes(intent.primary) || page.includes('/tickets')) {
      add({
        id: 'create-ticket',
        label: 'Create ticket',
        prompt: 'Create a ticket for the highest-risk issue from this AI review',
        reason: 'Use this when the finding needs tracked service work.',
        actionType: 'plan',
        confidence: 'review',
      });
    }

    if (firstAsset?.id) {
      add({
        id: 'open-asset',
        label: 'Open asset',
        prompt: `Open asset ${firstAsset.name}`,
        reason: `${firstAsset.name} matched the latest device evidence.`,
        actionType: 'navigate',
        confidence: 'high',
        href: `/assets/${firstAsset.id}`,
      });
    }

    if (compliance?.data?.stale || compliance?.data?.unmanaged || intent.primary === 'compliance') {
      add({
        id: 'remediate-devices',
        label: 'Plan device remediation',
        prompt: 'Create a remediation plan for stale, unmanaged, and non-compliant devices',
        reason: `${compliance?.data?.stale || 0} stale and ${compliance?.data?.unmanaged || 0} unmanaged device${(compliance?.data?.unmanaged || 0) === 1 ? '' : 's'} were reported.`,
        actionType: 'plan',
        confidence: 'high',
      });
    }

    if ((network?.data?.activeAlerts || snapshot.activeNetworkAlerts) > 0 || intent.primary === 'network') {
      add({
        id: 'network-alerts',
        label: 'Review network alerts',
        prompt: 'Summarize active network alerts and recommend the next technician action',
        reason: `${network?.data?.activeAlerts || snapshot.activeNetworkAlerts || 0} active network alert${(network?.data?.activeAlerts || snapshot.activeNetworkAlerts) === 1 ? '' : 's'} are in scope.`,
        actionType: 'ask',
        confidence: 'high',
      });
    }

    add({
      id: 'morning-briefing',
      label: 'Morning briefing',
      prompt: 'Give me a morning briefing',
      reason: 'Combines the main operational risk areas into one scan.',
      actionType: 'ask',
      confidence: 'high',
    });

    return recommendations.slice(0, 6);
  }

  private factsFromResults(snapshot: Record<string, number>, results: any[]) {
    const facts = [
      `Tickets: ${snapshot.tickets}`,
      `Open tickets: ${snapshot.openTickets}`,
      `Assets: ${snapshot.assets}`,
      `Enrolled devices: ${snapshot.enrolledDevices}`,
      `Active network alerts: ${snapshot.activeNetworkAlerts}`,
      `Active RMM providers: ${snapshot.rmmProviders}`,
    ];
    for (const result of results) {
      if (result.tool === 'summarize_ticket_backlog' && result.status === 'completed') {
        facts.push(`Backlog statuses: ${result.data.byStatus.map((row: any) => `${row.status || 'UNKNOWN'} ${row.count}`).join(', ') || 'none'}`);
      }
      if (result.tool === 'network_health_report' && result.status === 'completed') {
        facts.push(`Network devices: ${result.data.networkDevices}; syslog events in 24h: ${result.data.syslogEvents24h}`);
      }
      if (result.tool === 'rmm_summary' && result.status === 'completed') {
        facts.push(`RMM providers returned: ${result.data.providers.length}; recent sync runs: ${result.data.recentSyncs.length}`);
      }
    }
    return facts;
  }

  private goalTitle(goal: string) {
    const title = goal.replace(/\s+/g, ' ').trim();
    return title.length > 90 ? `${title.slice(0, 87)}...` : title;
  }

  private finalAnswer(goal: string, results: any[]) {
    const completed = results.filter((result) => result.status === 'completed').length;
    const skipped = results.filter((result) => result.status === 'skipped').length;
    return `Goal handled: "${this.goalTitle(goal)}". Completed ${completed} tool action${completed === 1 ? '' : 's'}${skipped ? ` and skipped ${skipped} action${skipped === 1 ? '' : 's'} pending approval, tenant context, or table availability` : ''}.`;
  }
}
