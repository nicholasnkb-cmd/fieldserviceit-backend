import { ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { EmailService } from '../../notifications/services/email.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockJwt: any;
  let mockConfig: any;
  let mockEmail: any;
  let mockSessions: any;

  beforeEach(() => {
    mockJwt = {
      sign: jest.fn().mockReturnValue('mock-access-token'),
      signAsync: jest.fn().mockResolvedValue('mock-access-token'),
    };
    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-secret';
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'REFRESH_TOKEN_EXPIRES_IN') return '7d';
        return 'test-value';
      }),
    };
    mockEmail = {
      sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      company: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      plan: {
        findUnique: jest.fn(),
      },
      companyPlan: {
        upsert: jest.fn(),
      },
      session: {
        create: jest.fn().mockResolvedValue({ id: 'session-1' }),
        update: jest.fn().mockResolvedValue({ id: 'session-1' }),
        deleteMany: jest.fn(),
      },
      query: jest.fn().mockResolvedValue([]),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    };

    const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const mockMfa = {
      isRequired: jest.fn().mockResolvedValue(false),
      verifyUserCode: jest.fn().mockResolvedValue(true),
      beginSetup: jest.fn(),
      confirmSetup: jest.fn(),
      status: jest.fn(),
      disable: jest.fn(),
    };
    mockSessions = {
      hashRefreshToken: jest.fn((value: string) => `sha256:${value}`),
      findByRefreshToken: jest.fn(),
      findReusedToken: jest.fn(),
      revokeActiveFamily: jest.fn(),
      revokeByRefreshToken: jest.fn(),
      recordRotation: jest.fn(),
    };
    service = new AuthService(
      mockPrisma as any,
      mockJwt as any,
      mockConfig as any,
      mockEmail as any,
      mockLogger as any,
      mockMfa as any,
      mockSessions as any,
    );
  });

  describe('refresh token reuse', () => {
    it('revokes the active family and records a critical alert', async () => {
      mockSessions.findByRefreshToken.mockResolvedValue(null);
      mockSessions.findReusedToken.mockResolvedValue({
        sessionId: 'session-1',
        userId: 'user-1',
        companyId: 'company-1',
      });

      await expect(service.refresh('replayed-token')).rejects.toThrow(UnauthorizedException);

      expect(mockSessions.revokeActiveFamily).toHaveBeenCalledWith('user-1', 'refresh-token-reuse');
      expect(mockPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO SecurityAlert'),
        expect.arrayContaining(['company-1', 'REFRESH_TOKEN_REUSE', 'critical', 'user-1']),
      );
    });
  });

  describe('registerBusiness', () => {
    const baseDto = {
      email: 'new@company.com',
      password: 'Test1234!',
      firstName: 'John',
      lastName: 'Doe',
    };

    it('should reject if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.registerBusiness(baseDto)).rejects.toThrow(ConflictException);
    });

    it('should throw if no companyName, inviteCode, or domain', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.registerBusiness(baseDto)).rejects.toThrow(BadRequestException);
    });

    it('should create company without assigning a Free company plan when companyName is provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const mockCompany = { id: 'company-1', name: 'Test Corp', slug: 'test-corp', inviteCode: 'ABCD1234' };
      const mockUser = { id: 'user-1', email: 'new@company.com', firstName: 'John', lastName: 'Doe', companyId: 'company-1', role: 'CLIENT', userType: 'BUSINESS', emailVerified: true };

      mockPrisma.company.create.mockResolvedValue(mockCompany);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.registerBusiness({ ...baseDto, companyName: 'Test Corp' });

      expect(mockPrisma.company.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'Test Corp' }) }),
      );
      expect(mockPrisma.plan.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.companyPlan.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ companyId: 'company-1', email: 'new@company.com' }) }),
      );
      expect(result.user.companyId).toBe('company-1');
      expect(result.user.email).toBe('new@company.com');
      expect(result.accessToken).toBe('mock-access-token');
    });

    it('should reject Free as a business registration plan', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.registerBusiness({ ...baseDto, companyName: 'No Plan Co', planName: 'Free' })).rejects.toThrow(BadRequestException);
      expect(mockPrisma.company.create).not.toHaveBeenCalled();
    });

    it('should join company via invite code when provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const mockCompany = { id: 'company-invite', name: 'Invite Co', isActive: true, inviteExpiresAt: new Date(Date.now() + 86400000) };
      const mockUser = { id: 'user-3', email: 'invite@test.com', firstName: 'Bob', lastName: 'Smith', companyId: 'company-invite', role: 'CLIENT', userType: 'BUSINESS', emailVerified: true };

      mockPrisma.company.findUnique.mockResolvedValue(mockCompany);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.registerBusiness({ ...baseDto, email: 'invite@test.com', inviteCode: 'INVITE123' });

      expect(mockPrisma.company.findUnique).toHaveBeenCalledWith({ where: { inviteCode: 'INVITE123' } });
      expect(result.user.companyId).toBe('company-invite');
    });

    it('should reject expired invite code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-expired',
        name: 'Expired Co',
        isActive: true,
        inviteExpiresAt: new Date(Date.now() - 86400000),
      });

      await expect(service.registerBusiness({ ...baseDto, inviteCode: 'EXPIRED' })).rejects.toThrow(BadRequestException);
    });

    it('should reject inactive invite code', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.company.findUnique.mockResolvedValue({
        id: 'company-inactive',
        name: 'Inactive Co',
        isActive: false,
        inviteExpiresAt: new Date(Date.now() + 86400000),
      });

      await expect(service.registerBusiness({ ...baseDto, inviteCode: 'INACTIVE' })).rejects.toThrow(BadRequestException);
    });

    it('should join company via domain match when domain param provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const mockCompany = { id: 'company-domain', name: 'Domain Co', isActive: true };
      const mockUser = { id: 'user-4', email: 'user@domainco.com', firstName: 'Alice', lastName: 'Jones', companyId: 'company-domain', role: 'CLIENT', userType: 'BUSINESS', emailVerified: true };

      mockPrisma.company.findFirst.mockResolvedValue(mockCompany);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.registerBusiness({ ...baseDto, email: 'user@domainco.com', domain: 'domainco.com' });

      expect(mockPrisma.company.findFirst).toHaveBeenCalledWith({ where: { domain: 'domainco.com', isActive: true } });
      expect(result.user.companyId).toBe('company-domain');
    });

    it('should reject if no company found for domain', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.company.findFirst.mockResolvedValue(null);

      await expect(service.registerBusiness({ ...baseDto, email: 'user@unknown.com', domain: 'unknown.com' })).rejects.toThrow(BadRequestException);
    });

    it('should create company when only companyName is provided (no inviteCode/domain)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const mockCompany = { id: 'company-only', name: 'Only Co', slug: 'only-co' };
      const mockUser = { id: 'user-only', email: 'only@test.com', firstName: 'Test', lastName: 'User', companyId: 'company-only', role: 'CLIENT', userType: 'BUSINESS', emailVerified: true };

      mockPrisma.company.create.mockResolvedValue(mockCompany);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.registerBusiness({ ...baseDto, email: 'only@test.com', companyName: 'Only Co' });

      expect(mockPrisma.company.create).toHaveBeenCalled();
      expect(mockPrisma.company.findUnique).not.toHaveBeenCalled();
      expect(result.user.companyId).toBe('company-only');
    });
  });
});
