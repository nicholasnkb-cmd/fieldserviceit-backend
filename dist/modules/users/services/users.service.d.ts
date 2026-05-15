import { PrismaService } from '../../../database/prisma.service';
declare enum UserRole {
    SUPER_ADMIN = "SUPER_ADMIN",
    TENANT_ADMIN = "TENANT_ADMIN",
    TECHNICIAN = "TECHNICIAN",
    CLIENT = "CLIENT",
    READ_ONLY = "READ_ONLY"
}
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role?: UserRole;
    }, companyId: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        companyId: string;
        createdAt: Date;
    }>;
    findAll(companyId: string, query: {
        page?: number;
        limit?: number;
    }): Promise<{
        data: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            isActive: boolean;
            lastLoginAt: Date;
            createdAt: Date;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findById(id: string): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        email: string;
        passwordHash: string | null;
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
        role: string;
        userType: string;
        companyId: string | null;
        isActive: boolean;
        emailVerified: boolean;
        lastLoginAt: Date | null;
        resetToken: string | null;
        resetTokenExpiresAt: Date | null;
        emailVerificationToken: string | null;
        emailVerificationExpiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    findOne(id: string, companyId: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        phone: string;
        avatarUrl: string;
        isActive: boolean;
        lastLoginAt: Date;
        createdAt: Date;
    }>;
    update(id: string, dto: any, companyId: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
    }>;
    updateMe(id: string, dto: {
        firstName?: string;
        lastName?: string;
        phone?: string;
    }): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        role: string;
        companyId: string;
        createdAt: Date;
    }>;
    changePassword(id: string, oldPassword: string, newPassword: string): Promise<{
        message: string;
    }>;
    remove(id: string, companyId: string): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        email: string;
        passwordHash: string | null;
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
        role: string;
        userType: string;
        companyId: string | null;
        isActive: boolean;
        emailVerified: boolean;
        lastLoginAt: Date | null;
        resetToken: string | null;
        resetTokenExpiresAt: Date | null;
        emailVerificationToken: string | null;
        emailVerificationExpiresAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
}
export {};
