import {
  credentialLookupValues,
  credentialMatches,
  hashCredential,
  isHashedCredential,
} from './credential-hash';

describe('credential hashing', () => {
  it('stores deterministic hashes without retaining the credential', () => {
    const hash = hashCredential('secret-token');
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hash).not.toContain('secret-token');
    expect(isHashedCredential(hash)).toBe(true);
  });

  it('supports hashed storage and legacy plaintext during migration', () => {
    const [hashed, legacy] = credentialLookupValues('secret-token');
    expect(credentialMatches('secret-token', hashed)).toBe(true);
    expect(credentialMatches('secret-token', legacy)).toBe(true);
    expect(credentialMatches('wrong-token', hashed)).toBe(false);
  });
});
