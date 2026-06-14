import { AiAgentService } from './ai-agent.service';

describe('AiAgentService deterministic answers', () => {
  const service = new AiAgentService({} as any, {} as any, {} as any);
  const snapshot = {
    tickets: 0,
    openTickets: 0,
    assets: 0,
    enrolledDevices: 0,
    activeNetworkAlerts: 0,
    rmmProviders: 0,
  };

  it('explains capabilities instead of returning generic zero counts', () => {
    const intent = (service as any).classifyIntent('What can you do?');
    const answer = (service as any).answerFromResults('What can you do?', intent, snapshot, []);

    expect(answer).toContain('search and summarize tickets');
    expect(answer).not.toContain('45% confidence');
  });

  it('returns a focused empty ticket result', () => {
    const intent = (service as any).classifyIntent('Find open printer tickets');
    const answer = (service as any).answerFromResults('Find open printer tickets', intent, snapshot, [
      { tool: 'search_tickets', status: 'completed', data: { count: 0, items: [] } },
      { tool: 'summarize_ticket_backlog', status: 'completed', data: { oldestOpen: [] } },
    ]);

    expect(answer).toContain('no tickets matching');
    expect(answer).not.toContain('Current scope has');
  });

  it('states the model limitation for unsupported open-ended questions', () => {
    const intent = (service as any).classifyIntent('Explain quantum computing');
    const answer = (service as any).answerFromResults('Explain quantum computing', intent, snapshot, []);

    expect(answer).toContain('Model reasoning is not configured');
  });
});
