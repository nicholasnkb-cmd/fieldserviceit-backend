import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { OidcAuthService } from './oidc-auth.service';

describe('OidcAuthService', () => {
  let db: any;
  let config: any;
  let service: OidcAuthService;

  beforeEach(() => {
    db = {
      query: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    };
    config = {
      get: jest.fn((key: string, fallback?: any) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'API_URL') return 'https://api.example.com';
        if (key === 'FRONTEND_URL') return 'https://app.example.com';
        return fallback;
      }),
    };
    service = new OidcAuthService(db, config);
  });

  it('filters enabled providers by the submitted email domain', async () => {
    db.query.mockResolvedValue([
      { id: 'one', name: 'One', issuer: 'https://id.example.com', allowedDomains: '["example.com"]' },
      { id: 'two', name: 'Two', issuer: 'https://id.other.com', allowedDomains: '["other.com"]' },
      { id: 'global', name: 'Global', issuer: 'https://id.global.com', allowedDomains: '[]' },
    ]);
    await expect(service.providers('person@example.com')).resolves.toEqual([
      { id: 'one', name: 'One', issuer: 'https://id.example.com' },
      { id: 'global', name: 'Global', issuer: 'https://id.global.com' },
    ]);
  });

  it('rejects private-network OIDC issuers in production', async () => {
    db.query.mockResolvedValue([{ id: 'private', issuer: 'https://127.0.0.1', clientId: 'client', enabled: 1 }]);
    await expect(service.start('private')).rejects.toThrow(BadRequestException);
  });

  it('consumes a one-time login code atomically', async () => {
    db.query.mockResolvedValue([{
      id: 'code-1',
      userId: 'user-1',
      email: 'person@example.com',
      isActive: 1,
    }]);
    await expect(service.consumeLoginCode('secret')).resolves.toMatchObject({ userId: 'user-1' });
    db.execute.mockResolvedValueOnce({ affectedRows: 0 });
    await expect(service.consumeLoginCode('secret')).rejects.toThrow(UnauthorizedException);
  });
});
