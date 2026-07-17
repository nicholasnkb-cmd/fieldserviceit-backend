export interface MigrationStatus {
  applied: number;
  pending: string[];
  failed: Array<{ name: string; error: string; attempts: number; lastAttemptAt: string }>;
}

type MigrationDatabase = { query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T> };

export async function ensureMigrationFailureTable(db: MigrationDatabase) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migration_failures (
      name VARCHAR(255) PRIMARY KEY,
      error_message VARCHAR(2000) NOT NULL,
      attempts INT NOT NULL DEFAULT 1,
      first_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_attempt_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
}

export async function recordMigrationFailure(db: MigrationDatabase, name: string, message: string) {
  await db.query(
    `INSERT INTO _migration_failures (name, error_message, attempts, first_attempt_at, last_attempt_at)
     VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE error_message = VALUES(error_message), attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP`,
    [name, message],
  );
}

export async function executeMigrationStatement(db: MigrationDatabase, statement: string) {
  const compatible = statement
    .replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, 'ADD COLUMN')
    .replace(/\bADD\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/gi, (_match, unique) => `ADD ${unique || ''}INDEX`)
    .replace(/\bCREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/gi, (_match, unique) => `CREATE ${unique || ''}INDEX`);
  try {
    await db.query(compatible);
  } catch (error: any) {
    const errno = Number(error?.errno);
    const executable = compatible.replace(/^\s*(?:\/\*[\s\S]*?\*\/\s*)+/, '');
    const isIndexStatement = /^\s*(CREATE\s+(UNIQUE\s+)?INDEX|ALTER\s+TABLE\b.*\bADD\s+(UNIQUE\s+)?INDEX)\b/is.test(executable);
    if ([1060, 1061].includes(errno)) return;
    if (errno === 1072 && isIndexStatement) return;
    // MySQL limits a table to 64 indexes. Older performance-only migrations
    // must not block later schema migrations when a legacy table is saturated.
    if (errno === 1069 && isIndexStatement) return;
    throw error;
  }
}

export async function readMigrationStatus(db: MigrationDatabase, migrationNames: string[]): Promise<MigrationStatus> {
  await ensureMigrationFailureTable(db);
  const appliedRows = await db.query<Array<{ name: string }>>('SELECT name FROM _migrations');
  const failedRows = await db.query<Array<{ name: string; error: string; attempts: number; lastAttemptAt: Date | string }>>(
    `SELECT name, error_message AS error, attempts, last_attempt_at AS lastAttemptAt
     FROM _migration_failures ORDER BY last_attempt_at DESC`,
  );
  const applied = new Set(appliedRows.map((row) => row.name));
  return {
    applied: applied.size,
    pending: migrationNames.filter((name) => !applied.has(name)),
    failed: failedRows.map((row) => ({ ...row, attempts: Number(row.attempts), lastAttemptAt: new Date(row.lastAttemptAt).toISOString() })),
  };
}
