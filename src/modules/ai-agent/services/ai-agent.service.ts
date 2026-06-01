import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
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

type AgentIntent = {
  primary: string;
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
  constructor(private prisma: PrismaService) {}

  listTools() {
    return { data: tools };
  }

  async plan(goal: string, user: any) {
    const cleanGoal = this.cleanGoal(goal);
    const intent = this.classifyIntent(cleanGoal);
    const steps = this.buildPlan(cleanGoal, intent);
    const snapshot = await this.workspaceSnapshot(user);

    return {
      goal: cleanGoal,
      mode: process.env.AI_PROVIDER ? 'model-ready' : 'deterministic',
      intent,
      summary: this.summarizePlan(steps, intent),
      contextNotes: this.contextNotes(user),
      snapshot,
      steps,
      requiredApprovals: [...new Set(steps.filter((step) => step.requiresApproval).map((step) => step.tool).filter(Boolean))],
      suggestedActions: this.suggestedActions(intent),
      riskSummary: this.riskSummary(steps),
    };
  }

  async ask(question: string, user: any) {
    const cleanQuestion = this.cleanGoal(question);
    const intent = this.classifyIntent(cleanQuestion);
    const snapshot = await this.workspaceSnapshot(user);
    const toolIds = this.readToolsForIntent(intent);
    const results = [];

    for (const toolId of toolIds) {
      results.push(await this.runTool(toolId, cleanQuestion, user, intent));
    }

    return {
      question: cleanQuestion,
      intent,
      answer: this.answerFromResults(intent, snapshot, results),
      facts: this.factsFromResults(snapshot, results),
      suggestedActions: this.suggestedActions(intent),
      contextNotes: this.contextNotes(user),
      snapshot,
      results,
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
      results.push(await this.runTool(tool.id, planned.goal, user, planned.intent));
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

  private classifyIntent(goal: string): AgentIntent {
    const normalized = goal.toLowerCase();
    const scores: Record<string, number> = {
      ticket: this.score(normalized, ['ticket', 'incident', 'request', 'case', 'issue', 'backlog']),
      asset: this.score(normalized, ['asset', 'device', 'laptop', 'desktop', 'phone', 'serial', 'inventory']),
      compliance: this.score(normalized, ['compliance', 'non-compliant', 'stale', 'security', 'unmanaged', 'fleet']),
      network: this.score(normalized, ['network', 'router', 'switch', 'firewall', 'ap', 'wan', 'port', 'syslog', 'snmp', 'latency', 'packet loss']),
      rmm: this.score(normalized, ['rmm', 'sync', 'ninja', 'datto', 'connectwise', 'integration', 'provider']),
      enrollment: this.score(normalized, ['enroll', 'mdm', 'token', 'onboard']),
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
    if (value.includes('high')) return 'HIGH';
    if (value.includes('medium')) return 'MEDIUM';
    if (value.includes('low')) return 'LOW';
    return undefined;
  }

  private queryTerm(goal: string, ticketNumber?: string, email?: string) {
    if (ticketNumber) return ticketNumber;
    if (email) return email;
    return goal
      .replace(/\b(show|find|search|list|summarize|summary|what|which|are|the|all|my|for|about|please|ticket|tickets|asset|assets|device|devices)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private buildPlan(goal: string, intent: AgentIntent): AgentStep[] {
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

    for (const toolId of this.readToolsForIntent(intent)) {
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
    if (['ticket', 'general'].includes(intent.primary)) {
      toolIds.add('search_tickets');
      toolIds.add('summarize_ticket_backlog');
    }
    if (['asset', 'compliance', 'enrollment', 'general'].includes(intent.primary)) {
      toolIds.add('search_assets');
    }
    if (['compliance', 'asset', 'enrollment'].includes(intent.primary)) {
      toolIds.add('device_compliance_report');
    }
    if (intent.primary === 'network') toolIds.add('network_health_report');
    if (intent.primary === 'rmm') toolIds.add('rmm_summary');
    return [...toolIds];
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

  private answerFromResults(intent: AgentIntent, snapshot: Record<string, number>, results: any[]) {
    const completed = results.filter((result) => result.status === 'completed');
    const skipped = results.filter((result) => result.status === 'skipped');
    const parts = [
      `I treated this as a ${intent.primary} request with ${intent.confidence}% confidence.`,
      `Current scope has ${snapshot.openTickets} open tickets, ${snapshot.assets} assets, ${snapshot.activeNetworkAlerts} active network alerts, and ${snapshot.rmmProviders} active RMM providers.`,
    ];
    const ticketSearch = completed.find((result) => result.tool === 'search_tickets');
    if (ticketSearch) parts.push(`Ticket search returned ${ticketSearch.data.count} matching ticket${ticketSearch.data.count === 1 ? '' : 's'}.`);
    const assetSearch = completed.find((result) => result.tool === 'search_assets');
    if (assetSearch) parts.push(`Asset search returned ${assetSearch.data.count} matching asset${assetSearch.data.count === 1 ? '' : 's'}.`);
    const compliance = completed.find((result) => result.tool === 'device_compliance_report');
    if (compliance) parts.push(`Device compliance is ${compliance.data.complianceRate}% across ${compliance.data.enrolled} enrolled device${compliance.data.enrolled === 1 ? '' : 's'}.`);
    if (skipped.length) parts.push(`${skipped.length} tool${skipped.length === 1 ? '' : 's'} could not run because context or tables were unavailable.`);
    parts.push('Create a plan if you want me to take an approved action.');
    return parts.join(' ');
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
