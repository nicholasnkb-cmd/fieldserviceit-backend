import { PrismaService } from '../../../database/prisma.service';
export declare class AdminService {
    private prisma;
    constructor(prisma: PrismaService);
    listPermissions(): Promise<import("mysql2").RowDataPacket[]>;
    listRoles(companyId?: string): Promise<import("mysql2").RowDataPacket[]>;
    getRole(roleId: string): Promise<import("mysql2").RowDataPacket>;
    createRole(dto: {
        name: string;
        slug: string;
        description?: string;
        companyId?: string;
        permissionSlugs?: string[];
    }): Promise<import("mysql2").RowDataPacket>;
    updateRole(roleId: string, dto: {
        name?: string;
        description?: string;
        permissionSlugs?: string[];
    }): Promise<import("mysql2").RowDataPacket>;
    deleteRole(roleId: string): Promise<{
        success: boolean;
    }>;
    assignUserRole(userId: string, roleId: string): Promise<import("mysql2").RowDataPacket>;
    removeUserRole(userId: string, roleId: string): Promise<{
        success: boolean;
    }>;
    getUserRoles(userId: string): Promise<import("mysql2").RowDataPacket[]>;
    listRolesLegacy(): {
        id: number;
        name: string;
        description: string;
    }[];
    private getRoleDescription;
    listUsers(query: {
        page?: number;
        limit?: number;
        search?: string;
        role?: string;
        userType?: string;
    }): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getUser(id: string): Promise<import("mysql2").RowDataPacket>;
    createUser(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role?: string;
        companyId: string;
    }): Promise<import("mysql2").RowDataPacket>;
    updateUserRole(userId: string, role: string): Promise<import("mysql2").RowDataPacket>;
    updateUser(id: string, dto: any): Promise<import("mysql2").RowDataPacket>;
    removeUser(id: string): Promise<import("mysql2").RowDataPacket>;
    listCompanies(query: {
        page?: number;
        limit?: number;
        search?: string;
    }): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    createCompany(dto: {
        name: string;
        slug: string;
        domain?: string;
    }): Promise<import("mysql2").RowDataPacket>;
    updateCompany(id: string, dto: any): Promise<import("mysql2").RowDataPacket>;
    removeCompany(id: string): Promise<import("mysql2").RowDataPacket>;
    generateInviteCode(companyId: string, expiresInDays?: number): Promise<import("mysql2").RowDataPacket>;
    listCompanyUsers(companyId: string, query: {
        page?: number;
        limit?: number;
        search?: string;
    }): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    updateCompanyUserRole(userId: string, role: string, companyId: string): Promise<import("mysql2").RowDataPacket>;
    getCompanyUser(userId: string, companyId: string): Promise<import("mysql2").RowDataPacket>;
    getCompanySettings(companyId: string): Promise<{
        settings: any;
        branding: any;
        constructor: {
            name: "RowDataPacket";
        };
    }>;
    updateCompanySettings(companyId: string, dto: any): Promise<import("mysql2").RowDataPacket>;
    createCompanyUser(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role?: string;
    }, companyId: string): Promise<import("mysql2").RowDataPacket>;
    removeCompanyUser(userId: string, companyId: string): Promise<import("mysql2").RowDataPacket>;
    listAuditLogs(query: {
        page?: number;
        limit?: number;
        companyId?: string;
    }): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getGlobalStats(): Promise<{
        totalUsers: number;
        totalCompanies: number;
        totalTickets: number;
        totalAssets: number;
        usersByType: import("mysql2").RowDataPacket[];
        ticketsByStatus: import("mysql2").RowDataPacket[];
    }>;
}
