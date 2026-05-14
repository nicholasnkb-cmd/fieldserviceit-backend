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
        role: string;
        createdAt: Date;
        id: string;
        companyId: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    findAll(companyId: string, query: {
        page?: number;
        limit?: number;
    }): Promise<{
        data: {
            role: string;
            createdAt: Date;
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            isActive: boolean;
            lastLoginAt: Date;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findById(id: string): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        companyId: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        avatarUrl: string;
        userType: string;
        isActive: boolean;
        lastLoginAt: Date;
    }>;
    findOne(id: string, companyId: string): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        avatarUrl: string;
        isActive: boolean;
        lastLoginAt: Date;
    }>;
    update(id: string, dto: any, companyId: string): Promise<{
        role: string;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    updateMe(id: string, dto: {
        firstName?: string;
        lastName?: string;
        phone?: string;
    }): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        companyId: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
    }>;
    changePassword(id: string, oldPassword: string, newPassword: string): Promise<{
        message: string;
    }>;
    remove(id: string, companyId: string): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        companyId: string | null;
        updatedAt: Date;
        email: string;
        passwordHash: string | null;
        firstName: string;
        lastName: string;
        phone: string | null;
        avatarUrl: string | null;
        userType: string;
        isActive: boolean;
        emailVerified: boolean;
        lastLoginAt: Date | null;
        resetToken: string | null;
        resetTokenExpiresAt: Date | null;
        emailVerificationToken: string | null;
        emailVerificationExpiresAt: Date | null;
        deletedAt: Date | null;
    }>;
}
export {};
