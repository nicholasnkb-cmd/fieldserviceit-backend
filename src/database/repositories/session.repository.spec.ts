import { SessionRepository } from './session.repository';
import { hashCredential } from '../../common/security/credential-hash';

describe('SessionRepository', () => {
  it('looks up the hash before the legacy plaintext token', async () => {
    const prisma = {
      query: jest.fn().mockResolvedValue([{ id: 'session-1', userId: 'user-1' }]),
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }) },
    };
    const repository = new SessionRepository(prisma as any);

    const result = await repository.findByRefreshToken('refresh-token', true);

    expect(prisma.query).toHaveBeenCalledWith(
      expect.stringContaining('refreshToken IN (?, ?)'),
      [hashCredential('refresh-token'), 'refresh-token', hashCredential('refresh-token')],
    );
    expect(result.user).toEqual({ id: 'user-1' });
  });

  it('records only a hash for rotated tokens', async () => {
    const prisma = { execute: jest.fn().mockResolvedValue({ affectedRows: 1 }) };
    const repository = new SessionRepository(prisma as any);

    await repository.recordRotation('session-1', 'user-1', 'old-token', new Date('2026-06-20T00:00:00Z'));

    expect(prisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('SessionRefreshHistory'),
      expect.arrayContaining(['session-1', 'user-1', hashCredential('old-token')]),
    );
  });
});
