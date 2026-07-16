const mockPool = {
  getConnection: jest.fn(),
  query: jest.fn(),
  execute: jest.fn(),
  end: jest.fn(),
};
const createPool = jest.fn(() => mockPool);

jest.mock('mysql2/promise', () => ({ createPool }));

import { DatabaseService } from './database.service';

describe('DatabaseService production controls', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'mysql://app:password@localhost:3306/fieldserviceit',
      DB_POOL_SIZE: '12',
      DB_POOL_MAX_IDLE: '4',
      DB_POOL_QUEUE_LIMIT: '250',
      DB_CONNECT_TIMEOUT_MS: '7000',
      DB_QUERY_TIMEOUT_MS: '9000',
    };
  });

  afterAll(() => { process.env = originalEnv; });

  it('configures a bounded pool from validated environment settings', () => {
    new DatabaseService();

    expect(createPool).toHaveBeenCalledWith(expect.objectContaining({
      connectionLimit: 12,
      maxIdle: 4,
      queueLimit: 250,
      connectTimeout: 7000,
    }));
  });

  it('fails module initialization when the database is unavailable', async () => {
    mockPool.getConnection.mockRejectedValueOnce(new Error('connection refused'));
    const service = new DatabaseService();

    await expect(service.onModuleInit()).rejects.toThrow('connection refused');
  });

  it('applies a timeout to queries', async () => {
    mockPool.query.mockResolvedValueOnce([[{ healthy: 1 }], []]);
    const service = new DatabaseService();

    await service.query('SELECT 1');

    expect(mockPool.query).toHaveBeenCalledWith({ sql: 'SELECT 1', timeout: 9000 }, []);
  });

  it('runs backup reads in a consistent read-only transaction', async () => {
    const connection = {
      query: jest.fn().mockResolvedValue([[], []]),
      commit: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    };
    mockPool.getConnection.mockResolvedValueOnce(connection);
    const service = new DatabaseService();

    await service.readOnlyTransaction(async () => 'snapshot');

    expect(connection.query).toHaveBeenNthCalledWith(1, 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    expect(connection.query).toHaveBeenNthCalledWith(2, 'START TRANSACTION READ ONLY WITH CONSISTENT SNAPSHOT');
    expect(connection.commit).toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalled();
  });
});
