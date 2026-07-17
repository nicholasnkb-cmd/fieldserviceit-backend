import { MigrationsService } from './migrations.service';
import { executeMigrationStatement } from './migration-state';

describe('MigrationsService', () => {
  it('continues when a performance index hits the MySQL key limit', async () => {
    const query = jest.fn().mockRejectedValue(Object.assign(new Error('Too many keys specified; max 64 keys allowed'), { errno: 1069 }));

    await expect(executeMigrationStatement(
      { query },
      'CREATE INDEX idx_asset_company_status ON Asset(companyId, status)',
    )).resolves.toBeUndefined();
  });

  it('does not suppress the MySQL key limit for schema statements', async () => {
    const error = Object.assign(new Error('Too many keys specified; max 64 keys allowed'), { errno: 1069 });
    const query = jest.fn().mockRejectedValue(error);

    await expect(executeMigrationStatement(
      { query },
      'CREATE TABLE UnsafeTable (id INT PRIMARY KEY)',
    )).rejects.toBe(error);
  });

  it('records a failed migration and continues applying later migrations', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql === 'BROKEN STATEMENT') throw new Error('synthetic migration failure');
      if (sql.startsWith('SELECT id FROM _migrations')) return [];
      return [];
    });
    const service = new MigrationsService({ query } as any);
    jest.spyOn(service as any, 'loadMigrations').mockReturnValue([
      { name: '001_broken', sql: 'BROKEN STATEMENT;' },
      { name: '002_safe', sql: 'CREATE TABLE IF NOT EXISTS SafeTable (id INT);' },
    ]);

    await expect(service.run()).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO _migration_failures'),
      ['001_broken', 'synthetic migration failure'],
    );
    expect(query).toHaveBeenCalledWith(
      'INSERT IGNORE INTO _migrations (name) VALUES (?)',
      ['002_safe'],
    );
  });

  it('reports applied, pending, and failed migration state', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql === 'SELECT name FROM _migrations') return [{ name: '001_done' }];
      if (sql.includes('FROM _migration_failures ORDER BY')) {
        return [{ name: '002_pending', error: 'failed', attempts: '2', lastAttemptAt: '2026-07-17T12:00:00.000Z' }];
      }
      return [];
    });
    const service = new MigrationsService({ query } as any);
    jest.spyOn(service as any, 'loadMigrations').mockReturnValue([
      { name: '001_done', sql: '' },
      { name: '002_pending', sql: '' },
    ]);

    await expect(service.getStatus()).resolves.toEqual({
      applied: 1,
      pending: ['002_pending'],
      failed: [{ name: '002_pending', error: 'failed', attempts: 2, lastAttemptAt: '2026-07-17T12:00:00.000Z' }],
    });
  });
});
