import * as fs from 'node:fs';
import * as path from 'node:path';

export function deployedCommit() {
  try {
    const release = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'release.json'), 'utf8'));
    const commit = String(release.commit || release.release || '').trim();
    if (commit) return commit;
  } catch {}
  return process.env.BACKEND_COMMIT || process.env.GITHUB_SHA || process.env.GIT_COMMIT || '';
}
