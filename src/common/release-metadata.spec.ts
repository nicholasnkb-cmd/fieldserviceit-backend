import { deployedCommit } from './release-metadata';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('deployedCommit', () => {
  const original = {
    BACKEND_COMMIT: process.env.BACKEND_COMMIT,
    GITHUB_SHA: process.env.GITHUB_SHA,
    GIT_COMMIT: process.env.GIT_COMMIT,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('prefers the deployment release file over stale platform metadata', () => {
    process.env.GIT_COMMIT = 'stale-platform-commit';
    const release = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'release.json'), 'utf8'));
    expect(deployedCommit()).toBe(release.commit);
  });

  it('falls back to explicitly injected metadata when no release file exists', () => {
    const cwd = process.cwd();
    process.env.BACKEND_COMMIT = 'release-from-environment';
    try {
      process.chdir(path.join(cwd, 'src'));
      expect(deployedCommit()).toBe('release-from-environment');
    } finally {
      process.chdir(cwd);
    }
  });
});
