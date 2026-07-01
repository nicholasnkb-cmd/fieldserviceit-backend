import { AiModelService } from './ai-model.service';

describe('AiModelService', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_MODEL;
    global.fetch = jest.fn() as any;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('uses deterministic mode when the provider is not fully configured', async () => {
    process.env.AI_PROVIDER = 'openai';
    const service = new AiModelService();

    expect(service.isConfigured()).toBe(false);
    expect(service.descriptor()).toEqual({ provider: 'deterministic', model: null });
    await expect(service.analyze('Show open tickets', {})).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('parses structured model analysis and disables response storage', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.AI_MODEL = 'gpt-test';
    const analysis = {
      primaryIntent: 'network',
      secondaryIntents: ['ticket'],
      confidence: 91,
      status: null,
      priority: 'HIGH',
      ticketNumber: null,
      email: null,
      query: 'branch latency',
      readTools: ['network_health_report', 'search_tickets'],
      summary: 'Inspect network health and related tickets.',
      suggestedActions: ['Review active alerts'],
    };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [{ content: [{ type: 'output_text', text: JSON.stringify(analysis) }] }],
      }),
    });
    const service = new AiModelService();

    const result = await service.analyze(
      'Why is the branch slow?',
      { activeNetworkAlerts: 2 },
      Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `message ${index}` })) as any,
    );

    expect(result).toEqual({ data: analysis, provider: 'openai', model: 'gpt-test' });
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe('json_schema');
    expect(body.input[1].content[0].text).toContain('message 11');
    expect(body.input[1].content[0].text).not.toContain('message 0');
  });

  it('falls back when the provider returns an invalid response', async () => {
    process.env.AI_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const service = new AiModelService();

    await expect(service.analyze('Show open tickets', {})).resolves.toBeNull();
  });
});
