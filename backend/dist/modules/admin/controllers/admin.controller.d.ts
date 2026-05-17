import { AdminService } from '../services/admin.service';
export declare class AdminController {
    private adminService;
    constructor(adminService: AdminService);
    listPermissions(): Promise<import("mysql2").RowDataPacket[]>;
    listRoles(user: any): Promise<import("mysql2").RowDataPacket[]>;
    getRole(id: string): Promise<import("mysql2").RowDataPacket>;
    createRole(dto: {
        name: string;
        slug: string;
        description?: string;
        companyId?: string;
        permissionSlugs?: string[];
    }): Promise<import("mysql2").RowDataPacket>;
    updateRole(id: string, dto: {
        name?: string;
        description?: string;
        permissionSlugs?: string[];
    }): Promise<import("mysql2").RowDataPacket>;
    deleteRole(id: string): Promise<{
        success: boolean;
    }>;
    assignUserRole(userId: string, roleId: string): Promise<import("mysql2").RowDataPacket>;
    removeUserRole(userId: string, roleId: string): Promise<{
        success: boolean;
    }>;
    getUserRoles(id: string): Promise<import("mysql2").RowDataPacket[]>;
    listRolesLegacy(): {
        id: number;
        name: string;
        description: string;
    }[];
    listUsers(query: any): Promise<{
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
    updateUserRole(id: string, role: string): Promise<import("mysql2").RowDataPacket>;
    updateUser(id: string, dto: any): Promise<import("mysql2").RowDataPacket>;
    removeUser(id: string): Promise<import("mysql2").RowDataPacket>;
    listCompanies(query: any): Promise<{
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
    generateInviteCode(id: string, expiresInDays?: number): Promise<import("mysql2").RowDataPacket>;
    listAuditLogs(query: any): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getStats(): Promise<{
        totalUsers: number;
        totalCompanies: number;
        totalTickets: number;
        totalAssets: number;
        usersByType: import("mysql2").RowDataPacket[];
        ticketsByStatus: import("mysql2").RowDataPacket[];
    }>;
    listCompanyRoles(user: any): Promise<import("mysql2").RowDataPacket[]>;
    createCompanyRole(dto: {
        name: string;
        slug: string;
        description?: string;
        permissionSlugs?: string[];
    }, user: any): Promise<import("mysql2").RowDataPacket>;
    updateCompanyRole(id: string, dto: {
        name?: string;
        description?: string;
        permissionSlugs?: string[];
    }, user: any): Promise<import("mysql2").RowDataPacket>;
    deleteCompanyRole(id: string): Promise<{
        success: boolean;
    }>;
    listCompanyUsers(query: any, user: any): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    createCompanyUser(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role?: string;
    }, user: any): Promise<import("mysql2").RowDataPacket>;
    getCompanyUser(id: string, user: any): Promise<import("mysql2").RowDataPacket>;
    updateCompanyUserRole(id: string, role: string, user: any): Promise<import("mysql2").RowDataPacket>;
    removeCompanyUser(id: string, user: any): Promise<import("mysql2").RowDataPacket>;
    generateCompanyInviteCode(user: any, expiresInDays?: number): Promise<import("mysql2").RowDataPacket>;
    getCompanySettings(user: any): Promise<{
        settings: any;
        branding: any;
        constructor: {
            name: "RowDataPacket";
        };
    }>;
    updateCompanySettings(dto: any, user: any): Promise<import("mysql2").RowDataPacket>;
}
