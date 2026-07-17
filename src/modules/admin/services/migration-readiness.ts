import { MigrationsService, MigrationStatus } from '../../../database/migrations/migrations.service';

type AddCheck = (name: string, ok: boolean, detail: string, severity?: 'info' | 'warning' | 'critical') => void;

export async function migrationReadiness(migrationsService: MigrationsService, add: AddCheck): Promise<MigrationStatus | null> {
  try {
    const migrations = await migrationsService.getStatus();
    const healthy = migrations.pending.length === 0 && migrations.failed.length === 0;
    add(
      'Database migrations',
      healthy,
      healthy
        ? `${migrations.applied} migrations applied; schema is current.`
        : `${migrations.pending.length} pending and ${migrations.failed.length} failed migration${migrations.failed.length === 1 ? '' : 's'}.`,
      migrations.failed.length > 0 ? 'critical' : 'warning',
    );
    return migrations;
  } catch (error: any) {
    add('Database migrations', false, error?.message || 'Migration status could not be read.', 'critical');
    return null;
  }
}
