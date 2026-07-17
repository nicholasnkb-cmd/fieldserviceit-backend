import * as fs from 'node:fs';
import * as path from 'node:path';

export function deployedCommit() {
  const candidates = [
    path.join(process.cwd(), 'release.json'),
    path.resolve(__dirname, '..', '..', 'release.json'),
  ];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const release = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      const commit = String(release.commit || release.release || '').trim();
      if (commit) return commit;
    } catch {}
  }
  return process.env.BACKEND_COMMIT || process.env.GITHUB_SHA || process.env.GIT_COMMIT || '';
}
