"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../database/prisma.service");
const email_service_1 = require("../../notifications/services/email.service");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
let AuthService = class AuthService {
    constructor(prisma, jwtService, config, emailService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.config = config;
        this.emailService = emailService;
    }
    async login(email, password) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!user.passwordHash) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
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
    async registerPublic(dto) {
        console.log('[registerPublic] Step 1: checking existing user for', dto.email);
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        console.log('[registerPublic] Step 2: existing user =', !!existing);
        if (existing) {
            throw new common_1.ConflictException('Email already registered');
        }
        console.log('[registerPublic] Step 3: hashing password');
        const passwordHash = await bcrypt.hash(dto.password, 4);
        console.log('[registerPublic] Step 4: password hashed, creating user');
        try {
            const user = await this.prisma.user.create({
                data: {
                    email: dto.email,
                    passwordHash,
                    firstName: dto.firstName,
                    lastName: dto.lastName,
                    role: 'CLIENT',
                    userType: 'PUBLIC',
                    emailVerified: true,
                },
            });
            console.log('[registerPublic] Step 5: user created, id =', user?.id);
            const tokens = await this.generateTokens(user);
            console.log('[registerPublic] Step 6: tokens generated');
            return {
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    userType: user.userType,
                    companyId: null,
                    emailVerified: false,
                },
                ...tokens,
            };
        }
        catch (err) {
            console.error('[registerPublic] DB error:', err?.message || String(err));
            console.error('[registerPublic] DB error stack:', err?.stack || 'no stack');
            throw new Error('Registration failed: ' + (err?.message || String(err)));
        }
    }
    async registerBusiness(dto) {
        const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
        if (existing) {
            throw new common_1.ConflictException('Email already registered');
        }
        let companyId = null;
        if (dto.inviteCode) {
            const company = await this.prisma.company.findUnique({
                where: { inviteCode: dto.inviteCode },
            });
            if (!company || !company.isActive) {
                throw new common_1.BadRequestException('Invalid invite code');
            }
            if (company.inviteExpiresAt && company.inviteExpiresAt < new Date()) {
                throw new common_1.BadRequestException('Invite code has expired');
            }
            companyId = company.id;
        }
        else if (dto.domain) {
            const domain = dto.email.split('@')[1];
            const company = await this.prisma.company.findFirst({
                where: { domain, isActive: true },
            });
            if (!company) {
                throw new common_1.BadRequestException('No company found for your email domain');
            }
            companyId = company.id;
        }
        else {
            throw new common_1.BadRequestException('Either invite code or company domain is required');
        }
        const passwordHash = await bcrypt.hash(dto.password, 4);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                passwordHash,
                firstName: dto.firstName,
                lastName: dto.lastName,
                role: 'CLIENT',
                userType: 'BUSINESS',
                companyId,
                emailVerified: true,
            },
        });
        const tokens = await this.generateTokens(user);
        return {
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                userType: user.userType,
                companyId: user.companyId,
                emailVerified: false,
            },
            ...tokens,
        };
    }
    async verifyEmail(token) {
        const user = await this.prisma.user.findFirst({
            where: {
                emailVerificationToken: token,
                emailVerificationExpiresAt: { gte: new Date() },
            },
        });
        if (!user)
            throw new common_1.BadRequestException('Invalid or expired verification token');
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
    async resendVerification(email) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user)
            throw new common_1.BadRequestException('User not found');
        if (user.emailVerified)
            throw new common_1.BadRequestException('Email already verified');
        this.sendVerificationEmail(user).catch((e) => {
            console.error('Failed to send verification email:', e.message);
        });
        return { message: 'Verification email sent' };
    }
    async sendVerificationEmail(user) {
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
        await this.emailService.sendNotificationEmail(user.email, 'Verify your email - FieldserviceIT', `
        <h2>Welcome to FieldserviceIT</h2>
        <p>Hi ${user.firstName},</p>
        <p>Please verify your email address by clicking the link below:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>This link expires in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
      `);
    }
    async forgotPassword(email) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (user) {
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
            await this.prisma.user.update({
                where: { id: user.id },
                data: { resetToken, resetTokenExpiresAt },
            });
            this.emailService.sendPasswordResetEmail(user.email, resetToken).catch((e) => {
                console.error('Failed to send reset email:', e.message);
            });
        }
        return { message: 'If the email exists, a reset link has been sent' };
    }
    async resetPassword(token, password) {
        const user = await this.prisma.user.findFirst({
            where: { resetToken: token, resetTokenExpiresAt: { gte: new Date() } },
        });
        if (!user)
            throw new common_1.BadRequestException('Invalid or expired reset token');
        const passwordHash = await bcrypt.hash(password, 4);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
        });
        return { message: 'Password has been reset successfully' };
    }
    async trackTicket(email, ticketNumber) {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new common_1.UnauthorizedException('No account found with this email');
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
            throw new common_1.UnauthorizedException('Ticket not found');
        }
        return ticket;
    }
    async refresh(refreshToken) {
        const session = await this.prisma.session.findUnique({
            where: { refreshToken },
            include: { user: true },
        });
        if (!session || session.expiresAt < new Date()) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        const tokens = await this.generateTokens(session.user);
        await this.prisma.session.update({
            where: { id: session.id },
            data: { refreshToken: tokens.refreshToken, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        });
        return tokens;
    }
    async logout(refreshToken) {
        await this.prisma.session.deleteMany({ where: { refreshToken } });
    }
    async generateTokens(user) {
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
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService,
        email_service_1.EmailService])
], AuthService);
//# sourceMappingURL=auth.service.js.map