import * as fs from 'node:fs';
import * as path from 'node:path';

export function deployedCommit() {
  const configured = process.env.BACKEND_COMMIT || process.env.GITHUB_SHA || process.env.GIT_COMMIT;
  if (configured) return configured;
  try {
    const release = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'release.json'), 'utf8'));
    return String(release.commit || release.release || '').trim();
  } catch {
    return '';
  }
}
