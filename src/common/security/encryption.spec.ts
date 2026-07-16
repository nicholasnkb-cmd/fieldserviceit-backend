import { decryptBuffer, decryptSecret, encryptBuffer, encryptSecret } from './encryption';

describe('credential encryption key rotation', () => {
  const originalCurrent = process.env.CREDENTIAL_ENCRYPTION_KEY;
  const originalPrevious = process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalCurrent === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalCurrent;
    if (originalPrevious === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS;
    else process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it('decrypts secrets and backups with the previous key during rotation', () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'old-key';
    delete process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS;
    const secret = encryptSecret('sensitive-value');
    const backup = encryptBuffer(Buffer.from('backup-data'));

    process.env.CREDENTIAL_ENCRYPTION_KEY = 'new-key';
    process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS = 'old-key';

    expect(decryptSecret(secret)).toBe('sensitive-value');
    expect(decryptBuffer(backup).toString()).toBe('backup-data');
  });

  it('refuses to use the JWT or development fallback in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-production-jwt-secret-that-is-long-enough';
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;

    expect(() => encryptSecret('sensitive-value')).toThrow(
      'CREDENTIAL_ENCRYPTION_KEY is required in production',
    );
  });
});
