import { MfaService } from './mfa.service';

describe('MfaService', () => {
  const db = {
    query: jest.fn(),
    execute: jest.fn(),
  };
  let service: MfaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MfaService(db as any);
  });

  it('verifies the RFC 4226 compatible TOTP vector', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(service.verifyTotp(secret, '287082', 59_000)).toBe(true);
    expect(service.verifyTotp(secret, '287083', 59_000)).toBe(false);
  });

  it('reports role-specific MFA enforcement', async () => {
    db.query.mockResolvedValue([{
      requireMfaSuperAdmin: 1,
      requireMfaTenantAdmin: 0,
      requireMfaTechnicians: 1,
    }]);
    await expect(service.isRequired('SUPER_ADMIN')).resolves.toBe(true);
    await expect(service.isRequired('TENANT_ADMIN')).resolves.toBe(false);
    await expect(service.isRequired('GLOBAL_TECH')).resolves.toBe(true);
  });

  it('creates an authenticator setup URI without storing the plaintext secret', async () => {
    db.execute.mockResolvedValue({ affectedRows: 1 });
    const result = await service.beginSetup('user-1', 'user@example.com');
    expect(result.secret).toMatch(/^[A-Z2-7]+$/);
    expect(result.otpauthUri).toContain('otpauth://totp/');
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining('mfaPendingSecretEncrypted'),
      [expect.not.stringContaining(result.secret), 'user-1'],
    );
  });

  it('rotates recovery codes after verifying an existing factor', async () => {
    jest.spyOn(service, 'verifyUserCode').mockResolvedValue(true);
    db.execute.mockResolvedValue({ affectedRows: 1 });

    const result = await service.regenerateRecoveryCodes('user-1', '123456');

    expect(result.recoveryCodes).toHaveLength(10);
    expect(new Set(result.recoveryCodes).size).toBe(10);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('mfaRecoveryCodes'), [expect.not.stringContaining(result.recoveryCodes[0]), 'user-1']);
  });
});
