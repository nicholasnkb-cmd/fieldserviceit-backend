import { QueryMetricsContext } from './query-metrics.context';

describe('QueryMetricsContext', () => {
  it('counts queries only inside the active request context', async () => {
    const context = new QueryMetricsContext();
    context.record(99);
    expect(context.current()).toBeUndefined();

    await context.run(async () => {
      context.record(12);
      await Promise.resolve();
      context.record(7);
      expect(context.current()).toEqual({ count: 2, durationMs: 19, slowestMs: 12 });
    });
  });
});
