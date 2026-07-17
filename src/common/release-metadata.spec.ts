import { deployedCommit } from './release-metadata';

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

  it('prefers explicitly injected deployment metadata', () => {
    process.env.BACKEND_COMMIT = 'release-from-environment';
    expect(deployedCommit()).toBe('release-from-environment');
  });

  it('reads the deployment repository release file', () => {
    delete process.env.BACKEND_COMMIT;
    delete process.env.GITHUB_SHA;
    delete process.env.GIT_COMMIT;
    expect(deployedCommit()).toBe('development');
  });
});
