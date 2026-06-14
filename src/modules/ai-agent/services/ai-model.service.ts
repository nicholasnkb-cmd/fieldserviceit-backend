import { Injectable } from '@nestjs/common';

export type AgentHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};

export type ModelAnalysis = {
  primaryIntent: string;
  secondaryIntents: string[];
  confidence: number;
  status: string | null;
  priority: string | null;
  ticketNumber: string | null;
  email: string | null;
  query: string | null;
  readTools: string[];
  summary: string;
  suggestedActions: string[];
};

type ModelResult<T> = {
  data: T;
  provider: 'openai';
  model: string;
};

const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    primaryIntent: { type: 'string', enum: ['ticket', 'asset', 'compliance', 'network', 'rmm', 'enrollment', 'general'] },
    secondaryIntents: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: ['ticket', 'asset', 'compliance', 'network', 'rmm', 'enrollment'] },
    },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    status: { type: ['string', 'null'], enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', null] },
    priority: { type: ['string', 'null'], enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', null] },
    ticketNumber: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    query: { type: ['string', 'null'] },
    readTools: {
      type: 'array',
      maxItems: 7,
      items: {
        type: 'string',
        enum: [
          'inspect_workspace',
          'search_tickets',
          'summarize_ticket_backlog',
          'search_assets',
          'device_compliance_report',
          'network_health_report',
          'rmm_summary',
        ],
      },
    },
    summary: { type: 'string' },
    suggestedActions: { type: 'array', maxItems: 5, items: { type: 'string' } },
  },
  required: [
    'primaryIntent',
    'secondaryIntents',
    'confidence',
    'status',
    'priority',
    'ticketNumber',
    'email',
    'query',
    'readTools',
    'summary',
    'suggestedActions',
  ],
};

const answerSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answer: { type: 'string' },
    facts: { type: 'array', maxItems: 10, items: { type: 'string' } },
    suggestedActions: { type: 'array', maxItems: 5, items: { type: 'string' } },
  },
  required: ['answer', 'facts', 'suggestedActions'],
};

@Injectable()
export class AiModelService {
  isConfigured() {
    return String(process.env.AI_PROVIDER || '').toLowerCase() === 'openai' && Boolean(process.env.OPENAI_API_KEY);
  }

  descriptor() {
    return {
      provider: this.isConfigured() ? 'openai' : 'deterministic',
      model: this.isConfigured() ? (process.env.AI_MODEL || 'gpt-5.4-mini') : null,
    };
  }

  async analyze(
    goal: string,
    snapshot: Record<string, number>,
    history: AgentHistoryItem[] = [],
  ): Promise<ModelResult<ModelAnalysis> | null> {
    return this.request<ModelAnalysis>(
      'fieldservice_agent_analysis',
      analysisSchema,
      [
        'You are the reasoning router for a multi-tenant IT service management agent.',
        'Classify the request, extract useful entities, and select only the read-only tools needed to answer it.',
        'Never select write tools. Never infer a tenant, ticket, device, person, or result that is not in the input.',
        'Prefer a small, focused tool set. Include inspect_workspace only when broad workspace totals improve the answer.',
      ].join(' '),
      { goal, snapshot, history: this.cleanHistory(history) },
    );
  }

  async synthesize(
    question: string,
    analysis: ModelAnalysis,
    snapshot: Record<string, number>,
    results: any[],
    history: AgentHistoryItem[] = [],
  ): Promise<ModelResult<{ answer: string; facts: string[]; suggestedActions: string[] }> | null> {
    return this.request(
      'fieldservice_agent_answer',
      answerSchema,
      [
        'You are a careful IT operations analyst.',
        'Answer only from the supplied workspace snapshot and tool evidence.',
        'Clearly distinguish observed facts from recommendations. Do not invent causes, users, devices, tickets, or successful actions.',
        'If evidence is missing or a tool was skipped, say what is unavailable.',
        'Keep the answer concise and operational. Write actions must be proposed as next steps requiring approval, never described as completed.',
      ].join(' '),
      { question, analysis, snapshot, results, history: this.cleanHistory(history) },
    );
  }

  private async request<T>(
    schemaName: string,
    schema: Record<string, any>,
    instructions: string,
    input: Record<string, any>,
  ): Promise<ModelResult<T> | null> {
    if (!this.isConfigured()) return null;
    const model = process.env.AI_MODEL || 'gpt-5.4-mini';
    const timeoutMs = Math.min(Math.max(Number(process.env.AI_TIMEOUT_MS) || 20000, 3000), 60000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: process.env.AI_REASONING_EFFORT || 'low' },
          input: [
            { role: 'developer', content: [{ type: 'input_text', text: instructions }] },
            { role: 'user', content: [{ type: 'input_text', text: JSON.stringify(input) }] },
          ],
          text: {
            verbosity: 'low',
            format: {
              type: 'json_schema',
              name: schemaName,
              strict: true,
              schema,
            },
          },
          max_output_tokens: 1800,
        }),
      });
      if (!response.ok) return null;
      const body: any = await response.json();
      const text = this.outputText(body);
      if (!text) return null;
      return { data: JSON.parse(text) as T, provider: 'openai', model };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private outputText(body: any) {
    if (typeof body?.output_text === 'string') return body.output_text;
    for (const item of body?.output || []) {
      for (const content of item?.content || []) {
        if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
      }
    }
    return '';
  }

  private cleanHistory(history: AgentHistoryItem[]) {
    return (Array.isArray(history) ? history : [])
      .filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item?.content === 'string')
      .slice(-8)
      .map((item) => ({ role: item.role, content: item.content.trim().slice(0, 1200) }))
      .filter((item) => item.content);
  }
}
