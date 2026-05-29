import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database.service';

interface Migration {
  name: string;
  sql: string;
}

@Injectable()
export class MigrationsService {
  private readonly logger = new Logger('MigrationsService');

  constructor(
    @Inject(forwardRef(() => DatabaseService))
    private readonly db: DatabaseService,
  ) {}

  async run(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB
    `);

    const migrations = this.loadMigrations();

    for (const migration of migrations) {
      const result = await this.db.query<any[]>(
        'SELECT id FROM _migrations WHERE name = ?',
        [migration.name],
      );
      if (result.length > 0) {
        this.logger.log(`Migration ${migration.name} already applied, skipping`);
        continue;
      }

      const statements = migration.sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        await this.db.query(stmt);
      }

      this.logger.log(`Migration ${migration.name} applied successfully`);
    }
  }

  private loadMigrations(): Migration[] {
    // Try to load from .sql files in the migrations directory
    // Falls back to inline embedded migrations if files not found (e.g. in production builds)
    const dir = this.resolveMigrationsDir();
    if (dir && fs.existsSync(dir)) {
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.sql'))
        .sort()
        .map(file => ({
          name: path.basename(file, '.sql'),
          sql: stripComments(fs.readFileSync(path.join(dir, file), 'utf8')),
        }));
    }

    this.logger.warn('No migration SQL files found on disk, using embedded defaults');
    return this.embeddedMigrations();
  }

  private resolveMigrationsDir(): string | null {
    // ts-node (dev): __dirname = src/database/migrations
    // compiled (prod): __dirname = dist/database/migrations (no .sql files)
    if (fs.existsSync(__dirname)) return __dirname;
    const fallback = path.join(process.cwd(), 'src', 'database', 'migrations');
    if (fs.existsSync(fallback)) return fallback;
    return null;
  }

  private embeddedMigrations(): Migration[] {
    return [
      {
        name: '001_initial',
        sql: stripComments(`
          CREATE TABLE IF NOT EXISTS _migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB;
          INSERT IGNORE INTO _migrations (name) VALUES ('001_initial');
        `),
      },
      {
        name: '002_seed_reference',
        sql: "INSERT IGNORE INTO _migrations (name) VALUES ('002_seed_reference');",
      },
    ];
  }
}

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n');
}
