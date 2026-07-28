import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { PasskeyService } from './passkey.service';

jest.mock('@simplewebauthn/server', () => ({
  generateAuthenticationOptions: jest.fn(),
  generateRegistrationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
}));

describe('PasskeyService', () => {
  let db: { query: jest.Mock; execute: jest.Mock };
  let service: PasskeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    db = { query: jest.fn(), execute: jest.fn().mockResolvedValue({ affectedRows: 1 }) };
    const config = { get: jest.fn((key: string, fallback?: string) => key === 'FRONTEND_URL' ? 'https://fieldserviceit.com' : fallback) };
    service = new PasskeyService(db as any, config as any);
  });

  it('requires discoverable credentials and user verification during registration', async () => {
    db.query.mockResolvedValue([]);
    (generateRegistrationOptions as jest.Mock).mockResolvedValue({ challenge: 'registration-challenge' });

    const result = await service.registrationOptions({ id: 'user-1', email: 'user@example.com' });

    expect(generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
      rpID: 'fieldserviceit.com',
      authenticatorSelection: expect.objectContaining({ residentKey: 'required', userVerification: 'required' }),
    }));
    expect(result).toEqual({ options: { challenge: 'registration-challenge' }, challengeId: expect.any(String) });
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INTERVAL 5 MINUTE'), expect.arrayContaining(['user-1', 'REGISTER', 'registration-challenge']));
  });

  it('creates discoverable passwordless authentication options', async () => {
    (generateAuthenticationOptions as jest.Mock).mockResolvedValue({ challenge: 'authentication-challenge' });

    const result = await service.authenticationOptions();

    expect(generateAuthenticationOptions).toHaveBeenCalledWith(expect.objectContaining({ userVerification: 'required' }));
    expect(result.challengeId).toEqual(expect.any(String));
  });

  it('verifies a passkey and persists its replay counter', async () => {
    db.query
      .mockResolvedValueOnce([{ id: 'challenge-1', challenge: 'expected' }])
      .mockResolvedValueOnce([{
        id: 'credential-row', credentialId: 'credential-id', publicKey: Buffer.from([1, 2, 3]),
        counter: 4, transports: '[]', userId: 'user-1', isActive: 1,
      }]);
    (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    });

    await expect(service.verifyAuthentication('challenge-1', { id: 'credential-id' } as any)).resolves.toEqual({ userId: 'user-1' });

    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({ requireUserVerification: true }));
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('SET counter = ?'), [5, 'credential-row']);
  });
});
