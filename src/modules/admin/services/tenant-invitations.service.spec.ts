import { BadRequestException, ConflictException } from '@nestjs/common';
import { TenantInvitationsService } from './tenant-invitations.service';
import { hashCredential } from '../../../common/security/credential-hash';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../auth/legal-consent';

const actor = {
  id: 'admin-1', email: 'admin@tenant.example', role: 'TENANT_ADMIN', userType: 'BUSINESS',
  companyId: 'company-1', isActive: true,
};

describe('TenantInvitationsService', () => {
  let db: any;
  let email: any;
  let service: TenantInvitationsService;

  beforeEach(() => {
    db = {
      query: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
      transaction: jest.fn(async (callback) => callback({ query: jest.fn(), execute: jest.fn() })),
    };
    email = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) };
    service = new TenantInvitationsService(db, email);
  });

  it('creates a company-scoped invitation and emails a one-time link', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'company-1', name: 'Example Co' }]);

    await expect(service.create('company-1', actor as any, { email: 'New.User@Example.com', role: 'TECHNICIAN' }))
      .resolves.toEqual(expect.objectContaining({ email: 'new.user@example.com', role: 'TECHNICIAN' }));

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(email.sendNotificationEmail).toHaveBeenCalledWith(
      'new.user@example.com', expect.stringContaining('Example Co'), expect.stringContaining('/invitations/accept?token='), expect.any(Object),
    );
  });

  it('rejects roles a tenant administrator cannot grant', async () => {
    await expect(service.create('company-1', actor as any, { email: 'admin@example.com', role: 'TENANT_ADMIN' } as any))
      .rejects.toThrow(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('atomically creates the invited user and consumes the invitation', async () => {
    db.query.mockResolvedValueOnce([{
      id: 'invite-1', email: 'new.user@example.com', role: 'CLIENT', companyId: 'company-1',
      companyName: 'Example Co', tokenHash: hashCredential('invite-token'), expiresAt: new Date(Date.now() + 60_000),
    }]);
    const tx = {
      query: jest.fn().mockResolvedValueOnce([{ id: 'invite-1' }]).mockResolvedValueOnce([]),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    };
    db.transaction.mockImplementationOnce(async (callback: (client: typeof tx) => Promise<any>) => callback(tx));

    await expect(service.accept('invite-token', {
      firstName: 'New', lastName: 'User', password: 'Unique-Correct-Horse-47!', termsAccepted: true,
      termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION,
    }, { ipAddress: '127.0.0.1', userAgent: 'test' })).resolves.toEqual({
      accepted: true, email: 'new.user@example.com', companyName: 'Example Co',
    });

    expect(tx.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO User'), expect.arrayContaining(['new.user@example.com', expect.any(String), 'New', 'User', 'CLIENT', 'company-1']));
    expect(tx.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE TenantUserInvitation SET acceptedAt'), ['invite-1']);
  });

  it('does not overwrite an existing account during acceptance', async () => {
    db.query.mockResolvedValueOnce([{
      id: 'invite-1', email: 'existing@example.com', role: 'CLIENT', companyId: 'company-1', companyName: 'Example Co',
    }]);
    const tx = {
      query: jest.fn().mockResolvedValueOnce([{ id: 'invite-1' }]).mockResolvedValueOnce([{ id: 'user-1' }]),
      execute: jest.fn(),
    };
    db.transaction.mockImplementationOnce(async (callback: (client: typeof tx) => Promise<any>) => callback(tx));

    await expect(service.accept('invite-token', {
      firstName: 'Existing', lastName: 'User', password: 'Unique-Correct-Horse-47!', termsAccepted: true,
      termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION,
    }, {})).rejects.toThrow(ConflictException);
    expect(tx.execute).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO User'), expect.anything());
  });
});
