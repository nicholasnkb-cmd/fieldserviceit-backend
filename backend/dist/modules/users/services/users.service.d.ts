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
    }, companyId: string): Promise<import("mysql2").RowDataPacket>;
    findAll(companyId: string, query: {
        page?: number;
        limit?: number;
    }): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findById(id: string): Promise<import("mysql2").RowDataPacket>;
    findOne(id: string, companyId: string): Promise<import("mysql2").RowDataPacket>;
    update(id: string, dto: any, companyId: string): Promise<import("mysql2").RowDataPacket>;
    updateMe(id: string, dto: {
        firstName?: string;
        lastName?: string;
        phone?: string;
    }): Promise<import("mysql2").RowDataPacket>;
    changePassword(id: string, oldPassword: string, newPassword: string): Promise<{
        message: string;
    }>;
    remove(id: string, companyId: string): Promise<import("mysql2").RowDataPacket>;
}
export {};
