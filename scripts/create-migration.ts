/**
 * Creates a new timestamped SQL migration file in src/database/migrations/.
 * Usage: npx ts-node --transpile-only scripts/create-migration.ts <name>
 * Example: npx ts-node --transpile-only scripts/create-migration.ts add_device_notes
 */

import * as fs from 'fs';
import * as path from 'path';

const name = process.argv[2];
if (!name) {
  console.error('Usage: npx ts-node --transpile-only scripts/create-migration.ts <migration_name>');
  console.error('Example: npx ts-node --transpile-only scripts/create-migration.ts add_device_notes');
  process.exit(1);
}

if (!/^[a-z0-9_]+$/.test(name)) {
  console.error('Error: Migration name must only contain lowercase letters, numbers, and underscores.');
  process.exit(1);
}

const migrationsDir = path.join(__dirname, '..', 'src', 'database', 'migrations');
if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

const existing = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .map(f => parseInt(f.split('_')[0], 10))
  .filter(n => !isNaN(n));

const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
const padded = nextNum.toString().padStart(3, '0');
const filename = `${padded}_${name}.sql`;
const filepath = path.join(migrationsDir, filename);

const content = `-- ${padded}_${name}
-- Created: ${new Date().toISOString()}
-- Description: ${name.replace(/_/g, ' ')}

-- Write your migration SQL below.
-- Use INSERT IGNORE INTO _migrations (name) VALUES ('${padded}_${name}') to self-register.

`;

fs.writeFileSync(filepath, content, 'utf8');
console.log(`Created migration: ${filename}`);
console.log(`Path: ${filepath}`);
