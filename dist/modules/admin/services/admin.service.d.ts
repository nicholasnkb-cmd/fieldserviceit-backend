import { PrismaService } from '../../../database/prisma.service';
export declare class AdminService {
    private prisma;
    constructor(prisma: PrismaService);
    listPermissions(): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        description: string | null;
        group: string | null;
    }[]>;
    listRoles(companyId?: string): Promise<({
        permissions: ({
            permission: {
                createdAt: Date;
                name: string;
                id: string;
                slug: string;
                description: string | null;
                group: string | null;
            };
        } & {
            roleId: string;
            createdAt: Date;
            permissionId: string;
        })[];
        _count: {
            userRoles: number;
        };
    } & {
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        updatedAt: Date;
    })[]>;
    getRole(roleId: string): Promise<{
        permissions: ({
            permission: {
                createdAt: Date;
                name: string;
                id: string;
                slug: string;
                description: string | null;
                group: string | null;
            };
        } & {
            roleId: string;
            createdAt: Date;
            permissionId: string;
        })[];
        _count: {
            userRoles: number;
        };
    } & {
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        updatedAt: Date;
    }>;
    createRole(dto: {
        name: string;
        slug: string;
        description?: string;
        companyId?: string;
        permissionSlugs?: string[];
    }): Promise<{
        permissions: ({
            permission: {
                createdAt: Date;
                name: string;
                id: string;
                slug: string;
                description: string | null;
                group: string | null;
            };
        } & {
            roleId: string;
            createdAt: Date;
            permissionId: string;
        })[];
    } & {
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        updatedAt: Date;
    }>;
    updateRole(roleId: string, dto: {
        name?: string;
        description?: string;
        permissionSlugs?: string[];
    }): Promise<{
        permissions: ({
            permission: {
                createdAt: Date;
                name: string;
                id: string;
                slug: string;
                description: string | null;
                group: string | null;
            };
        } & {
            roleId: string;
            createdAt: Date;
            permissionId: string;
        })[];
    } & {
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        updatedAt: Date;
    }>;
    deleteRole(roleId: string): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        updatedAt: Date;
    }>;
    assignUserRole(userId: string, roleId: string): Promise<{
        role: {
            createdAt: Date;
            name: string;
            id: string;
            slug: string;
            description: string | null;
            companyId: string | null;
            isSystem: boolean;
            updatedAt: Date;
        };
    } & {
        userId: string;
        roleId: string;
        createdAt: Date;
    }>;
    removeUserRole(userId: string, roleId: string): Promise<{
        userId: string;
        roleId: string;
        createdAt: Date;
    }>;
    getUserRoles(userId: string): Promise<({
        role: {
            permissions: ({
                permission: {
                    createdAt: Date;
                    name: string;
                    id: string;
                    slug: string;
                    description: string | null;
                    group: string | null;
                };
            } & {
                roleId: string;
                createdAt: Date;
                permissionId: string;
            })[];
        } & {
            createdAt: Date;
            name: string;
            id: string;
            slug: string;
            description: string | null;
            companyId: string | null;
            isSystem: boolean;
            updatedAt: Date;
        };
    } & {
        userId: string;
        roleId: string;
        createdAt: Date;
    })[]>;
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
        data: {
            company: {
                name: string;
                id: string;
            };
            role: string;
            createdAt: Date;
            id: string;
            companyId: string;
            email: string;
            firstName: string;
            lastName: string;
            userType: string;
            isActive: boolean;
            emailVerified: boolean;
            lastLoginAt: Date;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getUser(id: string): Promise<{
        company: {
            name: string;
            id: string;
        };
        role: string;
        createdAt: Date;
        id: string;
        companyId: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        userType: string;
        isActive: boolean;
        emailVerified: boolean;
        lastLoginAt: Date;
    }>;
    createUser(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role?: string;
        companyId: string;
    }): Promise<{
        role: string;
        id: string;
        companyId: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    updateUserRole(userId: string, role: string): Promise<{
        role: string;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    updateUser(id: string, dto: any): Promise<{
        role: string;
        id: string;
        companyId: string;
        email: string;
        firstName: string;
        lastName: string;
        isActive: boolean;
    }>;
    removeUser(id: string): Promise<{
        id: string;
        email: string;
    }>;
    listCompanies(query: {
        page?: number;
        limit?: number;
        search?: string;
    }): Promise<{
        data: ({
            _count: {
                assets: number;
                tickets: number;
                users: number;
            };
        } & {
            createdAt: Date;
            name: string;
            id: string;
            slug: string;
            updatedAt: Date;
            isActive: boolean;
            deletedAt: Date | null;
            inviteCode: string | null;
            domain: string | null;
            logo: string | null;
            settings: string | null;
            branding: string | null;
            inviteExpiresAt: Date | null;
        })[];
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
    }): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        updatedAt: Date;
        isActive: boolean;
        deletedAt: Date | null;
        inviteCode: string | null;
        domain: string | null;
        logo: string | null;
        settings: string | null;
        branding: string | null;
        inviteExpiresAt: Date | null;
    }>;
    updateCompany(id: string, dto: any): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        updatedAt: Date;
        isActive: boolean;
        deletedAt: Date | null;
        inviteCode: string | null;
        domain: string | null;
        logo: string | null;
        settings: string | null;
        branding: string | null;
        inviteExpiresAt: Date | null;
    }>;
    removeCompany(id: string): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        updatedAt: Date;
        isActive: boolean;
        deletedAt: Date | null;
        inviteCode: string | null;
        domain: string | null;
        logo: string | null;
        settings: string | null;
        branding: string | null;
        inviteExpiresAt: Date | null;
    }>;
    generateInviteCode(companyId: string, expiresInDays?: number): Promise<{
        name: string;
        id: string;
        inviteCode: string;
        inviteExpiresAt: Date;
    }>;
    listCompanyUsers(companyId: string, query: {
        page?: number;
        limit?: number;
        search?: string;
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
    updateCompanyUserRole(userId: string, role: string, companyId: string): Promise<{
        role: string;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    getCompanyUser(userId: string, companyId: string): Promise<{
        role: string;
        createdAt: Date;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        phone: string;
        userType: string;
        isActive: boolean;
        emailVerified: boolean;
        lastLoginAt: Date;
    }>;
    getCompanySettings(companyId: string): Promise<{
        settings: any;
        branding: any;
        name: string;
        id: string;
        slug: string;
        inviteCode: string;
        domain: string;
        logo: string;
        inviteExpiresAt: Date;
    }>;
    updateCompanySettings(companyId: string, dto: any): Promise<{
        name: string;
        id: string;
        domain: string;
        logo: string;
        settings: string;
        branding: string;
    }>;
    createCompanyUser(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role?: string;
    }, companyId: string): Promise<{
        role: string;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    removeCompanyUser(userId: string, companyId: string): Promise<{
        id: string;
        email: string;
    }>;
    listAuditLogs(query: {
        page?: number;
        limit?: number;
        companyId?: string;
    }): Promise<{
        data: ({
            company: {
                name: string;
                id: string;
            };
            actor: {
                id: string;
                email: string;
                firstName: string;
                lastName: string;
            };
        } & {
            createdAt: Date;
            id: string;
            companyId: string;
            action: string;
            actorId: string;
            resourceType: string;
            resourceId: string;
            diff: string | null;
            ip: string | null;
            userAgent: string | null;
        })[];
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
        usersByType: (import(".prisma/client").Prisma.PickEnumerable<import(".prisma/client").Prisma.UserGroupByOutputType, "userType"[]> & {
            _count: number;
        })[];
        ticketsByStatus: (import(".prisma/client").Prisma.PickEnumerable<import(".prisma/client").Prisma.TicketGroupByOutputType, "status"[]> & {
            _count: number;
        })[];
    }>;
}
