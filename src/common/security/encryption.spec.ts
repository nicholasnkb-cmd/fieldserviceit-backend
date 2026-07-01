import { decryptBuffer, decryptSecret, encryptBuffer, encryptSecret } from './encryption';

describe('credential encryption key rotation', () => {
  const originalCurrent = process.env.CREDENTIAL_ENCRYPTION_KEY;
  const originalPrevious = process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS;

  afterEach(() => {
    if (originalCurrent === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalCurrent;
    if (originalPrevious === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS;
    else process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS = originalPrevious;
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
});
