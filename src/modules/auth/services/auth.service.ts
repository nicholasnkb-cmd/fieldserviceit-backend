import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { EmailService } from '../../notifications/services/email.service';
import { LoggerService } from '../../../common/logger/logger.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const BCRYPT_ROUNDS = 12;
const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const loginFailures = new Map<string, { count: number; lockedUntil?: number; lastFailureAt: number }>();

type RegistrationProfile = {
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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
    private readonly logger: LoggerService,
  ) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();
    await this.enforceLoginBackoff(normalizedEmail);

    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || !user.isActive) {
      this.recordLoginFailure(normalizedEmail, 'unknown-or-inactive-user');
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      this.recordLoginFailure(normalizedEmail, 'missing-password-hash');
      throw new UnauthorizedException('Invalid credentials');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      this.recordLoginFailure(normalizedEmail, 'bad-password');
      throw new UnauthorizedException('Invalid credentials');
    }

    loginFailures.delete(normalizedEmail);
    const tokens = await this.generateTokens(user);
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

  async registerPublic(dto: RegistrationProfile) {
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

    const tokens = await this.generateTokens(user);

    return {
      user: { ...this.responseUser(user), companyId: null, emailVerified: false },
      ...tokens,
    };
  }

  async registerBusiness(dto: BusinessRegistrationProfile) {
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

    const tokens = await this.generateTokens(user);

    return {
      user: { ...this.responseUser(user), emailVerified: false },
      ...tokens,
    };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiresAt: { gte: new Date() },
      },
    });
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
        emailVerificationToken: token,
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
        data: { resetToken, resetTokenExpiresAt },
      });
      this.emailService.sendPasswordResetEmail(user.email, resetToken).catch((e) => {
        this.logger.error('Failed to send reset email: ' + e.message);
      });
    }
    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(token: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiresAt: { gte: new Date() } },
    });
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
    const session = await this.prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(session.user);

    await this.prisma.session.deleteMany({ where: { id: session.id } });

    return tokens;
  }

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({ where: { refreshToken } }).catch(() => {});
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      userType: user.userType,
      companyId: user.companyId,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = crypto.randomBytes(32).toString('hex');

    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private async enforceLoginBackoff(email: string) {
    const failure = loginFailures.get(email);
    if (!failure) return;
    if (failure.lockedUntil && failure.lockedUntil > Date.now()) {
      this.logger.warn(`Login locked for ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }
    const delayMs = Math.min(2000, failure.count * 250);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  private recordLoginFailure(email: string, reason: string) {
    const existing = loginFailures.get(email) || { count: 0, lastFailureAt: 0 };
    const count = existing.count + 1;
    const lockedUntil = count >= LOGIN_LOCK_THRESHOLD ? Date.now() + LOGIN_LOCK_MS : existing.lockedUntil;
    loginFailures.set(email, { count, lockedUntil, lastFailureAt: Date.now() });
    this.logger.warn(`Login failure for ${email}: ${reason}; count=${count}${lockedUntil ? '; locked=true' : ''}`);
  }
}
