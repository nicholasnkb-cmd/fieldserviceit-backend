import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrivacyRequestsService } from './privacy-requests.service';
import { hashCredential } from '../../common/security/credential-hash';
import { encryptSecret } from '../../common/security/encryption';

const user = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'TENANT_ADMIN',
  userType: 'BUSINESS',
  companyId: 'company-1',
  isActive: true,
};

describe('PrivacyRequestsService', () => {
  let db: { query: jest.Mock; execute: jest.Mock };
  let service: PrivacyRequestsService;
  let email: { sendNotificationEmail: jest.Mock };

  beforeEach(() => {
    db = { query: jest.fn(), execute: jest.fn().mockResolvedValue({ affectedRows: 1 }) };
    email = { sendNotificationEmail: jest.fn().mockResolvedValue(undefined) };
    service = new PrivacyRequestsService(db as any, email as any);
  });

  it('creates a deadline-tracked request without disclosing account state', async () => {
    db.query
      .mockResolvedValueOnce([{ id: 'requester-1', companyId: 'company-1' }])
      .mockResolvedValueOnce([{ id: 'request-1', requestType: 'ACCESS', status: 'VERIFYING' }]);

    const result = await service.create({ email: 'Requester@Example.com', requestType: 'ACCESS' });

    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INTERVAL 1 MONTH'), expect.arrayContaining([
      expect.any(String), 'company-1', 'requester-1', 'requester@example.com', 'ACCESS',
    ]));
    expect(result).toEqual(expect.objectContaining({ requestType: 'ACCESS', status: 'VERIFYING' }));
    expect(email.sendNotificationEmail).toHaveBeenCalledWith(
      'requester@example.com',
      expect.stringContaining('Verify'),
      expect.stringContaining('/privacy/verify?token='),
      expect.any(Object),
    );
  });

  it('uses the California 45-day response window when requested', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'request-2', status: 'VERIFYING' }]);

    await service.create({ email: 'requester@example.com', requestType: 'ACCESS', jurisdiction: 'California CPRA' });

    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('INTERVAL 45 DAY'), expect.any(Array));
  });

  it('verifies a one-use privacy request token', async () => {
    db.query.mockResolvedValueOnce([{ id: 'request-1', verificationTokenHash: hashCredential('valid-token') }]);

    await expect(service.verify('valid-token')).resolves.toEqual({ verified: true });
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'RECEIVED'"), ['request-1']);
  });

  it('decrypts an export only after atomically consuming its one-use token', async () => {
    db.query.mockResolvedValueOnce([{
      id: 'artifact-1', requestId: 'request-1', tokenHash: hashCredential('export-token'),
      content: encryptSecret(JSON.stringify({ account: { email: 'requester@example.com' } })),
    }]);

    await expect(service.downloadExport('export-token')).resolves.toEqual({ account: { email: 'requester@example.com' } });
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('downloadedAt = NOW(3)'), ['artifact-1']);
  });

  it('rejects a concurrently consumed export token', async () => {
    db.query.mockResolvedValueOnce([{
      id: 'artifact-1', requestId: 'request-1', tokenHash: hashCredential('export-token'),
      content: encryptSecret(JSON.stringify({ private: true })),
    }]);
    db.execute.mockResolvedValueOnce({ affectedRows: 0 });

    await expect(service.downloadExport('export-token')).rejects.toThrow(BadRequestException);
  });

  it('does not complete a request until identity is verified', async () => {
    db.query.mockResolvedValueOnce([{ id: 'request-1', companyId: 'company-1', identityVerifiedAt: null }]);

    await expect(service.update('request-1', { status: 'COMPLETED' }, user)).rejects.toThrow(BadRequestException);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('requires a reason when a request is denied', async () => {
    db.query.mockResolvedValueOnce([{ id: 'request-1', companyId: 'company-1', resolutionNotes: null }]);

    await expect(service.update('request-1', { status: 'DENIED' }, user)).rejects.toThrow(BadRequestException);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('prevents tenant administrators from updating another tenant request', async () => {
    db.query.mockResolvedValueOnce([]);

    await expect(service.update('request-1', { status: 'IN_REVIEW' }, user)).rejects.toThrow(NotFoundException);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('AND companyId = ?'), ['request-1', 'company-1']);
  });

  it('audits a verified completion', async () => {
    db.query
      .mockResolvedValueOnce([{ id: 'request-1', companyId: 'company-1', identityVerifiedAt: null, resolutionNotes: null }])
      .mockResolvedValueOnce([{ id: 'request-1', status: 'COMPLETED' }]);

    await service.update('request-1', { status: 'COMPLETED', identityVerified: true, resolutionNotes: 'Delivered securely' }, user);

    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('PRIVACY_REQUEST_UPDATED'), expect.arrayContaining(['company-1', 'admin-1', 'request-1']));
  });
});
