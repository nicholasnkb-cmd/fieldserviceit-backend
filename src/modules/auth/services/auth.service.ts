import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { EmailService } from '../../notifications/services/email.service';
import { LoggerService } from '../../../common/logger/logger.service';
import { MfaService } from './mfa.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { hashCredential } from '../../../common/security/credential-hash';
import { SessionRepository } from '../../../database/repositories/session.repository';
import { LegalConsentInput, PRIVACY_VERSION, TERMS_VERSION } from '../legal-consent';

const BCRYPT_ROUNDS = 12;
const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

type RegistrationProfile = LegalConsentInput & {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  location?: string;
  preferredContactMethod?: string;
  timezone?: string;
  planName?: string;
};

type BusinessRegistrationProfile = RegistrationProfile & {
  jobTitle?: string;
  department?: string;
  companyName?: string;
  inviteCode?: string;
  domain?: string;
};

type SessionContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  mfaVerifiedAt?: Date | null;
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
    private readonly logger: LoggerService,
    private readonly mfaService: MfaService,
    private readonly sessions: SessionRepository,
  ) {}

  async login(email: string, password: string, mfaCode?: string, context: SessionContext = {}) {
    const normalizedEmail = email.toLowerCase().trim();
    await this.enforceLoginBackoff(normalizedEmail);

    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.isActive) {
      await this.recordLoginFailure(normalizedEmail, 'unknown-or-inactive-user');
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      await this.recordLoginFailure(normalizedEmail, 'missing-password-hash');
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.recordLoginFailure(normalizedEmail, 'bad-password');
      throw new UnauthorizedException('Invalid credentials');
    }

    const mfaRequiredByPolicy = await this.mfaService.isRequired(user.role);
    if (user.mfaEnabled) {
      if (!mfaCode) {
        return {
          mfaRequired: true,
          challengeToken: this.createMfaChallenge(user.id, 'login'),
          user: this.responseUser(user),
        };
      }
      await this.mfaService.verifyUserCode(user.id, mfaCode);
      context.mfaVerifiedAt = new Date();
    } else if (mfaRequiredByPolicy) {
      return {
        mfaEnrollmentRequired: true,
        challengeToken: this.createMfaChallenge(user.id, 'enroll'),
        user: this.responseUser(user),
      };
    }

    await this.clearLoginFailures(normalizedEmail);
    const tokens = await this.generateTokens(user, context);
    await this.recordLoginSecuritySignals(user, context);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        userType: user.userType,
        companyId: user.companyId,
        emailVerified: user.emailVerified,
      },
      ...tokens,
    };
  }

  private registrationProfileData(dto: RegistrationProfile) {
    return {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone?.trim() || null,
      location: dto.location?.trim() || null,
      preferredContactMethod: dto.preferredContactMethod?.trim() || null,
      timezone: dto.timezone?.trim() || null,
    };
  }

  private responseUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      jobTitle: user.jobTitle,
      department: user.department,
      location: user.location,
      preferredContactMethod: user.preferredContactMethod,
      timezone: user.timezone,
      role: user.role,
      userType: user.userType,
      companyId: user.companyId,
      emailVerified: user.emailVerified,
    };
  }

  async registerPublic(dto: RegistrationProfile, context: SessionContext = {}) {
    this.assertCurrentLegalConsent(dto);
    dto.email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        ...this.registrationProfileData(dto),
        passwordHash,
        role: 'CLIENT',
        userType: 'PUBLIC',
        emailVerified: true,
      },
    });

    await this.recordLegalConsent(user.id, context, dto);

    const tokens = await this.generateTokens(user);

    return {
      user: { ...this.responseUser(user), companyId: null },
      ...tokens,
    };
  }

  async registerBusiness(dto: BusinessRegistrationProfile, context: SessionContext = {}) {
    this.assertCurrentLegalConsent(dto);
    dto.email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    if (dto.planName && dto.planName.toLowerCase() !== 'business') {
      throw new BadRequestException('Companies must choose the Business plan');
    }

    let companyId: string | null = null;

    if (dto.companyName && !dto.inviteCode && !dto.domain) {
      const slug = dto.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
      const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      const company = await this.prisma.company.create({
        data: {
          name: dto.companyName,
          slug,
          inviteCode,
          inviteExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
      companyId = company.id;

    } else if (dto.inviteCode) {
      const company = await this.prisma.company.findUnique({
        where: { inviteCode: dto.inviteCode },
      });
      if (!company || !company.isActive) {
        throw new BadRequestException('Invalid invite code');
      }
      if (company.inviteExpiresAt && company.inviteExpiresAt < new Date()) {
        throw new BadRequestException('Invite code has expired');
      }
      companyId = company.id;
    } else if (dto.domain) {
      const domain = dto.email.split('@')[1];
      const company = await this.prisma.company.findFirst({
        where: { domain, isActive: true },
      });
      if (!company) {
        throw new BadRequestException('No company found for your email domain');
      }
      companyId = company.id;
    } else {
      throw new BadRequestException('Either companyName, invite code, or company domain is required');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        ...this.registrationProfileData(dto),
        jobTitle: dto.jobTitle?.trim() || null,
        department: dto.department?.trim() || null,
        passwordHash,
        role: 'CLIENT',
        userType: 'BUSINESS',
        companyId,
        emailVerified: true,
      },
    });

    await this.recordLegalConsent(user.id, context, dto);

    const tokens = await this.generateTokens(user);

    return {
      user: { ...this.responseUser(user) },
      ...tokens,
    };
  }

  private assertCurrentLegalConsent(dto: LegalConsentInput) {
    if (!dto.termsAccepted || dto.termsVersion !== TERMS_VERSION || dto.privacyVersion !== PRIVACY_VERSION) {
      throw new BadRequestException('Review and accept the current Terms of Service and Privacy Policy');
    }
  }

  private async recordLegalConsent(userId: string, context: SessionContext, dto: LegalConsentInput) {
    await this.prisma.execute(
      `INSERT INTO UserLegalConsent
       (id, userId, termsVersion, privacyVersion, ipAddress, userAgent, acceptedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        crypto.randomUUID(),
        userId,
        dto.termsVersion,
        dto.privacyVersion,
        context.ipAddress || null,
        context.userAgent?.slice(0, 500) || null,
      ],
    );
  }

  async verifyEmail(token: string) {
    const user = await this.findUserByCredential('emailVerificationToken', token, 'emailVerificationExpiresAt');
    if (!user) throw new BadRequestException('Invalid or expired verification token');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
      },
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (user && !user.emailVerified) {
      this.sendVerificationEmail(user as { id: string; email: string; firstName: string }).catch((e) => {
        this.logger.error('Failed to send verification email: ' + e.message);
      });
    }
    return { message: 'If the email exists and is not verified, a verification email has been sent' };
  }

  private async sendVerificationEmail(user: { id: string; email: string; firstName: string }) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: hashCredential(token),
        emailVerificationExpiresAt: expiresAt,
      },
    });

    const verifyUrl = `${this.config.get('FRONTEND_URL', 'http://localhost:3000')}/verify-email?token=${token}`;

    await this.emailService.sendNotificationEmail(
      user.email,
      'Verify your email - FieldserviceIT',
      `
        <h2>Welcome to FieldserviceIT</h2>
        <p>Hi ${user.firstName},</p>
        <p>Please verify your email address by clicking the link below:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
      `,
    );
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetToken: hashCredential(resetToken), resetTokenExpiresAt },
      });
      this.emailService.sendPasswordResetEmail(user.email, resetToken).catch((e) => {
        this.logger.error('Failed to send reset email: ' + e.message);
      });
    }
    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(token: string, password: string) {
    const user = await this.findUserByCredential('resetToken', token, 'resetTokenExpiresAt');
    if (!user) throw new BadRequestException('Invalid or expired reset token');
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
    });
    await this.prisma.session.deleteMany({ where: { userId: user.id } });
    return { message: 'Password has been reset successfully' };
  }

  async trackTicket(email: string, ticketNumber: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      throw new UnauthorizedException('Ticket not found');
    }

    const ticket = await this.prisma.ticket.findFirst({
      where: {
        ticketNumber,
        createdById: user.id,
        deletedAt: null,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        resolvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        timeline: { orderBy: { createdAt: 'desc' }, take: 50, include: { actor: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });

    if (!ticket) {
      throw new UnauthorizedException('Ticket not found');
    }

    return ticket;
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const session = await this.sessions.findByRefreshToken(refreshToken, true);

    if (!session) {
      const reused = await this.sessions.findReusedToken(refreshToken);
      if (reused) {
        await this.sessions.revokeActiveFamily(reused.userId, 'refresh-token-reuse');
        await this.insertSecurityAlert(
          reused.companyId || null,
          'REFRESH_TOKEN_REUSE',
          'critical',
          reused.userId,
          'A rotated refresh token was reused; active sessions were revoked',
          { sessionId: reused.sessionId },
        );
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (session.expiresAt < new Date() || session.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.generateTokens(session.user, {}, session.id, refreshToken);
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;
    await this.sessions.revokeByRefreshToken(refreshToken, 'logout').catch((error) => {
      this.logger.warn(`Failed to revoke refresh token during logout: ${error?.message || error}`);
    });
  }

  async beginChallengeEnrollment(challengeToken: string) {
    const payload = this.verifyMfaChallenge(challengeToken, 'enroll');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('MFA challenge is invalid');
    return this.mfaService.beginSetup(user.id, user.email);
  }

  async confirmChallengeEnrollment(challengeToken: string, code: string, context: SessionContext = {}) {
    const payload = this.verifyMfaChallenge(challengeToken, 'enroll');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('MFA challenge is invalid');
    const setup = await this.mfaService.confirmSetup(user.id, code);
    context.mfaVerifiedAt = new Date();
    const tokens = await this.generateTokens(user, context);
    await this.recordLoginSecuritySignals(user, context);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user: this.responseUser(user), ...tokens, ...setup };
  }

  async confirmChallengeLogin(challengeToken: string, code: string, context: SessionContext = {}) {
    const payload = this.verifyMfaChallenge(challengeToken, 'login');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException('MFA challenge is invalid');
    await this.mfaService.verifyUserCode(user.id, code);
    context.mfaVerifiedAt = new Date();
    await this.clearLoginFailures(user.email);
    const tokens = await this.generateTokens(user, context);
    await this.recordLoginSecuritySignals(user, context);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user: this.responseUser(user), ...tokens };
  }

  async beginMfaSetup(user: any) {
    return this.mfaService.beginSetup(user.id, user.email);
  }

  async confirmMfaSetup(user: any, code: string) {
    return this.mfaService.confirmSetup(user.id, code);
  }

  async mfaStatus(userId: string) {
    return this.mfaService.status(userId);
  }

  async disableMfa(userId: string, code: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash || !password || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Password confirmation is invalid');
    }
    return this.mfaService.disable(userId, code);
  }

  async stepUp(userId: string, sessionId: string | undefined, code: string) {
    if (!sessionId) throw new UnauthorizedException('A revocable session is required');
    await this.mfaService.verifyUserCode(userId, code);
    const result = await this.prisma.execute(
      `UPDATE Session SET mfaVerifiedAt = NOW(3), lastSeenAt = NOW(3)
       WHERE id = ? AND userId = ? AND revokedAt IS NULL AND expiresAt > NOW(3)`,
      [sessionId, userId],
    );
    if (!result.affectedRows) throw new UnauthorizedException('Session is not active');
    return { verified: true, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const rows = await this.prisma.query<any[]>(
      `SELECT id, deviceInfo, ipAddress, userAgent, createdAt, lastSeenAt, expiresAt, revokedAt, revokeReason
       FROM Session WHERE userId = ? ORDER BY COALESCE(lastSeenAt, createdAt) DESC`,
      [userId],
    );
    return rows.map((row) => ({
      ...row,
      current: row.id === currentSessionId,
      active: !row.revokedAt && new Date(row.expiresAt) > new Date(),
    }));
  }

  async revokeSession(userId: string, sessionId: string, actorId: string) {
    const result = await this.prisma.execute(
      `UPDATE Session SET revokedAt = NOW(3), revokedById = ?, revokeReason = 'user-revoked'
       WHERE id = ? AND userId = ? AND revokedAt IS NULL`,
      [actorId, sessionId, userId],
    );
    if (!result.affectedRows) throw new BadRequestException('Session is not active');
    return { revoked: true };
  }

  async revokeOtherSessions(userId: string, currentSessionId?: string) {
    await this.prisma.execute(
      `UPDATE Session SET revokedAt = NOW(3), revokedById = ?, revokeReason = 'user-revoked-others'
       WHERE userId = ? AND revokedAt IS NULL ${currentSessionId ? 'AND id <> ?' : ''}`,
      currentSessionId ? [userId, userId, currentSessionId] : [userId, userId],
    );
    return { revoked: true };
  }

  async completeSsoLogin(userId: string, context: SessionContext = {}, trustedMfa = false) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('SSO account is not available');
    const mfaRequiredByPolicy = await this.mfaService.isRequired(user.role);
    if (mfaRequiredByPolicy && !trustedMfa && !user.mfaEnabled) {
      return {
        mfaEnrollmentRequired: true,
        challengeToken: this.createMfaChallenge(user.id, 'enroll'),
        user: this.responseUser(user),
      };
    }
    if (trustedMfa) context.mfaVerifiedAt = new Date();
    const tokens = await this.generateTokens(user, context);
    await this.recordLoginSecuritySignals(user, context);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { user: this.responseUser(user), ...tokens };
  }

  private async generateTokens(user: any, context: SessionContext = {}, existingSessionId?: string, previousRefreshToken?: string) {
    const policyRows = await this.prisma.query<any[]>(
      `SELECT sessionLifetimeDays, maxActiveSessions FROM PlatformSecurityPolicy WHERE id = 'global-security-policy' LIMIT 1`,
    ).catch(() => []);
    const sessionLifetimeDays = Math.min(Math.max(Number(policyRows[0]?.sessionLifetimeDays || 7), 1), 30);
    const maxActiveSessions = Math.min(Math.max(Number(policyRows[0]?.maxActiveSessions || 10), 1), 50);
    const expiresAt = new Date(Date.now() + sessionLifetimeDays * 24 * 60 * 60 * 1000);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const refreshToken = crypto.randomBytes(32).toString('hex');
      const refreshTokenHash = this.sessions.hashRefreshToken(refreshToken);
      try {
        let session: any;
        if (existingSessionId) {
          if (!previousRefreshToken) throw new UnauthorizedException('Invalid refresh token');
          session = await this.sessions.rotate(
            existingSessionId,
            user.id,
            previousRefreshToken,
            refreshTokenHash,
            expiresAt,
            context.mfaVerifiedAt,
          );
          if (!session) throw new UnauthorizedException('Refresh token has already been rotated');
        } else {
          session = await this.prisma.session.create({
            data: {
              userId: user.id,
              refreshToken: refreshTokenHash,
              deviceInfo: this.deviceLabel(context.userAgent),
              userAgent: context.userAgent?.slice(0, 500) || null,
              ipAddress: context.ipAddress?.slice(0, 191) || null,
              lastSeenAt: new Date(),
              mfaVerifiedAt: context.mfaVerifiedAt || null,
              expiresAt,
            },
          });
        }

        const payload = {
          sub: user.id,
          sid: session.id,
          email: user.email,
          role: user.role,
          userType: user.userType,
          companyId: user.companyId,
          av: user.authVersion || 0,
        };
        const accessToken = this.jwtService.sign(payload);
        await this.trimSessions(user.id, maxActiveSessions, session.id);

        return { accessToken, refreshToken, expiresIn: 900 };
      } catch (err: any) {
        if (!String(err?.message || '').includes('Duplicate entry') || attempt === 4) throw err;
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    throw new UnauthorizedException('Unable to create session');
  }

  private createMfaChallenge(userId: string, purpose: 'login' | 'enroll') {
    return this.jwtService.sign(
      { sub: userId, purpose, nonce: crypto.randomBytes(12).toString('hex') },
      { expiresIn: '5m' },
    );
  }

  private async findUserByCredential(
    tokenColumn: 'resetToken' | 'emailVerificationToken',
    token: string,
    expiryColumn: 'resetTokenExpiresAt' | 'emailVerificationExpiresAt',
  ) {
    const rows = await this.prisma.query<any[]>(
      `SELECT id FROM User
       WHERE ${tokenColumn} IN (?, ?)
         AND ${expiryColumn} >= NOW(3)
       LIMIT 1`,
      [hashCredential(token), token],
    );
    return rows[0] ? this.prisma.user.findUnique({ where: { id: rows[0].id } }) : null;
  }

  private verifyMfaChallenge(token: string, purpose: 'login' | 'enroll') {
    try {
      const payload = this.jwtService.verify(token);
      if (payload?.purpose !== purpose || !payload?.sub) throw new Error('Invalid purpose');
      return payload;
    } catch {
      throw new UnauthorizedException('MFA challenge is invalid or expired');
    }
  }

  private async trimSessions(userId: string, maxActiveSessions: number, keepSessionId: string) {
    const rows = await this.prisma.query<any[]>(
      `SELECT id FROM Session
       WHERE userId = ? AND revokedAt IS NULL AND expiresAt > NOW(3)
       ORDER BY COALESCE(lastSeenAt, createdAt) DESC`,
      [userId],
    );
    const stale = rows.slice(maxActiveSessions).filter((row) => row.id !== keepSessionId);
    if (!stale.length) return;
    await this.prisma.execute(
      `UPDATE Session SET revokedAt = NOW(3), revokeReason = 'session-limit'
       WHERE id IN (${stale.map(() => '?').join(', ')})`,
      stale.map((row) => row.id),
    );
  }

  private deviceLabel(userAgent?: string | null) {
    const value = String(userAgent || '');
    const browser = value.includes('Edg/') ? 'Edge' : value.includes('Chrome/') ? 'Chrome' : value.includes('Firefox/') ? 'Firefox' : value.includes('Safari/') ? 'Safari' : 'Browser';
    const os = value.includes('Windows') ? 'Windows' : value.includes('Mac OS') ? 'macOS' : value.includes('Android') ? 'Android' : value.includes('iPhone') || value.includes('iPad') ? 'iOS' : value.includes('Linux') ? 'Linux' : 'Unknown device';
    return `${browser} on ${os}`.slice(0, 191);
  }

  private async recordLoginSecuritySignals(user: any, context: SessionContext) {
    if (!['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role)) return;
    const prior = await this.prisma.query<any[]>(
      `SELECT id FROM Session
       WHERE userId = ? AND createdAt >= DATE_SUB(NOW(3), INTERVAL 90 DAY)
         AND revokedAt IS NULL
         AND ((ipAddress IS NOT NULL AND ipAddress <> ?) OR (userAgent IS NOT NULL AND userAgent <> ?))
       LIMIT 1`,
      [user.id, context.ipAddress || '', context.userAgent || ''],
    ).catch(() => []);
    if (prior[0]) {
      await this.insertSecurityAlert(
        user.companyId,
        'PRIVILEGED_NEW_CONTEXT',
        'warning',
        user.id,
        `Privileged login from a new network or device: ${user.email}`,
        { ipAddress: context.ipAddress, device: this.deviceLabel(context.userAgent) },
      );
    }
    if (user.isBreakGlass) {
      await this.insertSecurityAlert(
        user.companyId,
        'BREAK_GLASS_LOGIN',
        'critical',
        user.id,
        `Break-glass account used: ${user.email}`,
        { ipAddress: context.ipAddress, device: this.deviceLabel(context.userAgent) },
      );
    }
  }

  private async insertSecurityAlert(companyId: string | null, alertType: string, severity: string, subjectId: string, summary: string, detail: any) {
    await this.prisma.execute(
      `INSERT INTO SecurityAlert
       (id, companyId, alertType, severity, subjectId, summary, detail, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [crypto.randomUUID(), companyId, alertType, severity, subjectId, summary.slice(0, 255), JSON.stringify(detail)],
    ).catch((error) => {
      this.logger.error(`Failed to persist security alert ${alertType} for subject ${subjectId}: ${error?.message || error}`);
    });
  }

  private async enforceLoginBackoff(email: string) {
    let rows: any[];
    try {
      rows = await this.prisma.query<any[]>(
        `SELECT failureCount, lockedUntil, lastFailureAt
         FROM LoginAbuseState WHERE emailHash = ? LIMIT 1`,
        [this.loginEmailHash(email)],
      );
    } catch (error) {
      if (!this.isMissingLoginAbuseTable(error)) throw error;
      this.logger.warn('Login abuse state is unavailable; request throttling remains active');
      return;
    }
    const failure = rows[0];
    if (!failure) return;
    const lockedUntil = failure.lockedUntil ? new Date(failure.lockedUntil).getTime() : 0;
    if (lockedUntil > Date.now()) {
      this.logger.warn(`Login locked for account hash ${this.loginEmailHash(email).slice(0, 12)}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    const delayMs = Math.min(2000, Number(failure.failureCount || 0) * 250);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  private async recordLoginFailure(email: string, reason: string) {
    const emailHash = this.loginEmailHash(email);
    try {
      await this.prisma.execute(
        `INSERT INTO LoginAbuseState (emailHash, failureCount, lockedUntil, lastFailureAt, updatedAt)
         VALUES (?, 1, NULL, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE
           failureCount = IF(lastFailureAt < DATE_SUB(NOW(3), INTERVAL ? MICROSECOND), 1, failureCount + 1),
           lockedUntil = IF(failureCount >= ?, DATE_ADD(NOW(3), INTERVAL ? MICROSECOND),
             IF(lockedUntil > NOW(3), lockedUntil, NULL)),
           lastFailureAt = NOW(3), updatedAt = NOW(3)`,
        [emailHash, LOGIN_LOCK_MS * 1000, LOGIN_LOCK_THRESHOLD, LOGIN_LOCK_MS * 1000],
      );
    } catch (error) {
      if (!this.isMissingLoginAbuseTable(error)) throw error;
    }
    this.logger.warn(`Login failure for account hash ${emailHash.slice(0, 12)}: ${reason}`);
  }

  private async clearLoginFailures(email: string) {
    try {
      await this.prisma.execute(`DELETE FROM LoginAbuseState WHERE emailHash = ?`, [this.loginEmailHash(email)]);
    } catch (error) {
      if (!this.isMissingLoginAbuseTable(error)) throw error;
    }
  }

  private isMissingLoginAbuseTable(error: any) {
    return Number(error?.errno) === 1146 || error?.code === 'ER_NO_SUCH_TABLE';
  }

  private loginEmailHash(email: string) {
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
  }
}
