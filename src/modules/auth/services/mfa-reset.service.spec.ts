import { MfaResetService } from './mfa-reset.service';

describe('MfaResetService', () => {
  let db: { query: jest.Mock; execute: jest.Mock; transaction: jest.Mock };
  let email: { sendNotificationEmail: jest.Mock };
  let service: MfaResetService;

  beforeEach(() => {
    db = {
      query: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
      transaction: jest.fn(),
    };
    email = { sendNotificationEmail: jest.fn().mockResolvedValue({}) };
    service = new MfaResetService(db as any, email as any);
  });

  it('returns the same generic response for an unknown account', async () => {
    db.query.mockResolvedValueOnce([]);

    const result = await service.create({ email: 'missing@example.com' });

    expect(result.received).toBe(true);
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('deduplicates active reset requests', async () => {
    db.query.mockResolvedValueOnce([{ id: 'user-1' }]).mockResolvedValueOnce([{ id: 'existing' }]);

    await service.create({ email: 'user@example.com', reason: 'Lost device' });

    expect(db.execute).not.toHaveBeenCalled();
  });

  it('approves a reset with session revocation, audit evidence, and notification', async () => {
    const connection = {
      query: jest.fn().mockResolvedValue([{
        id: 'request-1', userId: 'user-1', email: 'user@example.com', companyId: 'company-1', status: 'PENDING',
      }]),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    };
    db.transaction.mockImplementation(async (callback) => callback(connection));
    const actor = { id: 'admin-1', email: 'admin@example.com', role: 'TENANT_ADMIN', userType: 'BUSINESS', companyId: 'company-1', isActive: true };

    await service.review('request-1', { status: 'APPROVED', reviewNotes: 'Identity verified by approved callback' }, actor);

    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('authVersion = authVersion + 1'), ['user-1']);
    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining("approved-mfa-reset"), ['admin-1', 'user-1']);
    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE MfaResetRequest'), expect.arrayContaining(['APPROVED', 'admin-1']));
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('MFA_RESET_REVIEWED'), expect.any(Array));
    expect(email.sendNotificationEmail).toHaveBeenCalledWith('user@example.com', expect.stringContaining('approved'), expect.any(String), expect.any(Object));
  });
});
