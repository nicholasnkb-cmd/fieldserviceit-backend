import { DatabaseThrottlerStorage } from './database-throttler-storage.service';

describe('DatabaseThrottlerStorage', () => {
  it('increments shared state and returns block metadata', async () => {
    const db = {
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
      query: jest.fn().mockResolvedValue([{
        totalHits: 6,
        timeToExpire: 42,
        blockedUntil: new Date(Date.now() + 30_000),
        timeToBlockExpire: 30,
      }]),
    };
    const storage = new DatabaseThrottlerStorage(db as any);

    await expect(storage.increment('client-key', 60_000, 5, 30_000, 'login')).resolves.toEqual({
      totalHits: 6,
      timeToExpire: 42,
      isBlocked: true,
      timeToBlockExpire: 30,
    });
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.execute.mock.calls[0][1][0]).toMatch(/^[a-f0-9]{64}$/);
    expect(db.execute.mock.calls[0][1]).not.toContain('client-key');
  });

  it('removes expired shared state', async () => {
    const db = { execute: jest.fn().mockResolvedValue({ affectedRows: 2 }) };
    const storage = new DatabaseThrottlerStorage(db as any);

    await storage.cleanupExpiredState();

    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM RateLimitState'));
  });
});
