import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { EmailService } from '../../notifications/services/email.service';
export declare class AuthService {
    private prisma;
    private jwtService;
    private config;
    private emailService;
    constructor(prisma: PrismaService, jwtService: JwtService, config: ConfigService, emailService: EmailService);
    login(email: string, password: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            userType: string;
            companyId: string;
            emailVerified: boolean;
        };
    }>;
    registerPublic(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            userType: string;
            companyId: any;
            emailVerified: boolean;
        };
    }>;
    registerBusiness(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        inviteCode?: string;
        domain?: string;
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            userType: string;
            companyId: string;
            emailVerified: boolean;
        };
    }>;
    verifyEmail(token: string): Promise<{
        message: string;
    }>;
    resendVerification(email: string): Promise<{
        message: string;
    }>;
    private sendVerificationEmail;
    forgotPassword(email: string): Promise<{
        message: string;
    }>;
    resetPassword(token: string, password: string): Promise<{
        message: string;
    }>;
    trackTicket(email: string, ticketNumber: string): Promise<{
        assignedTo: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        createdBy: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        resolvedBy: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        timeline: ({
            actor: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & {
            createdAt: Date;
            id: string;
            ticketId: string;
            action: string;
            actorId: string;
            oldValue: string | null;
            newValue: string | null;
            comment: string | null;
            isInternal: boolean;
        })[];
    } & {
        createdAt: Date;
        id: string;
        description: string | null;
        companyId: string | null;
        updatedAt: Date;
        priority: string;
        deletedAt: Date | null;
        ticketNumber: string;
        title: string;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        type: string;
        createdById: string;
        assignedToId: string | null;
        assetId: string | null;
        slaId: string | null;
        contractId: string | null;
        trackingToken: string | null;
        onHoldReason: string | null;
        resolution: string | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
    }>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
    }>;
    logout(refreshToken: string): Promise<void>;
    private generateTokens;
}
