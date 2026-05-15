import { PrismaService } from '../../../database/prisma.service';
export declare class AdminService {
    private prisma;
    constructor(prisma: PrismaService);
    listPermissions(): Promise<(import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        slug: string;
        group: string | null;
        description: string | null;
        createdAt: Date;
    }, unknown> & {})[]>;
    listRoles(companyId?: string): Promise<({
        permissions: ({
            permission: import("@prisma/client/runtime").GetResult<{
                id: string;
                name: string;
                slug: string;
                group: string | null;
                description: string | null;
                createdAt: Date;
            }, unknown> & {};
        } & import("@prisma/client/runtime").GetResult<{
            roleId: string;
            permissionId: string;
            createdAt: Date;
        }, unknown> & {})[];
        _count: {
            userRoles: number;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {})[]>;
    getRole(roleId: string): Promise<{
        permissions: ({
            permission: import("@prisma/client/runtime").GetResult<{
                id: string;
                name: string;
                slug: string;
                group: string | null;
                description: string | null;
                createdAt: Date;
            }, unknown> & {};
        } & import("@prisma/client/runtime").GetResult<{
            roleId: string;
            permissionId: string;
            createdAt: Date;
        }, unknown> & {})[];
        _count: {
            userRoles: number;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {}>;
    createRole(dto: {
        name: string;
        slug: string;
        description?: string;
        companyId?: string;
        permissionSlugs?: string[];
    }): Promise<{
        permissions: ({
            permission: import("@prisma/client/runtime").GetResult<{
                id: string;
                name: string;
                slug: string;
                group: string | null;
                description: string | null;
                createdAt: Date;
            }, unknown> & {};
        } & import("@prisma/client/runtime").GetResult<{
            roleId: string;
            permissionId: string;
            createdAt: Date;
        }, unknown> & {})[];
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {}>;
    updateRole(roleId: string, dto: {
        name?: string;
        description?: string;
        permissionSlugs?: string[];
    }): Promise<{
        permissions: ({
            permission: import("@prisma/client/runtime").GetResult<{
                id: string;
                name: string;
                slug: string;
                group: string | null;
                description: string | null;
                createdAt: Date;
            }, unknown> & {};
        } & import("@prisma/client/runtime").GetResult<{
            roleId: string;
            permissionId: string;
            createdAt: Date;
        }, unknown> & {})[];
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {}>;
    deleteRole(roleId: string): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {}>;
    assignUserRole(userId: string, roleId: string): Promise<{
        role: import("@prisma/client/runtime").GetResult<{
            id: string;
            name: string;
            slug: string;
            description: string | null;
            companyId: string | null;
            isSystem: boolean;
            createdAt: Date;
            updatedAt: Date;
        }, unknown> & {};
    } & import("@prisma/client/runtime").GetResult<{
        userId: string;
        roleId: string;
        createdAt: Date;
    }, unknown> & {}>;
    removeUserRole(userId: string, roleId: string): Promise<import("@prisma/client/runtime").GetResult<{
        userId: string;
        roleId: string;
        createdAt: Date;
    }, unknown> & {}>;
    getUserRoles(userId: string): Promise<({
        role: {
            permissions: ({
                permission: import("@prisma/client/runtime").GetResult<{
                    id: string;
                    name: string;
                    slug: string;
                    group: string | null;
                    description: string | null;
                    createdAt: Date;
                }, unknown> & {};
            } & import("@prisma/client/runtime").GetResult<{
                roleId: string;
                permissionId: string;
                createdAt: Date;
            }, unknown> & {})[];
        } & import("@prisma/client/runtime").GetResult<{
            id: string;
            name: string;
            slug: string;
            description: string | null;
            companyId: string | null;
            isSystem: boolean;
            createdAt: Date;
            updatedAt: Date;
        }, unknown> & {};
    } & import("@prisma/client/runtime").GetResult<{
        userId: string;
        roleId: string;
        createdAt: Date;
    }, unknown> & {})[]>;
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
            id: string;
            email: string;
            firstName: string;
            lastName: string;
            role: string;
            userType: string;
            companyId: string;
            company: {
                id: string;
                name: string;
            };
            isActive: boolean;
            emailVerified: boolean;
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
    getUser(id: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        userType: string;
        companyId: string;
        company: {
            id: string;
            name: string;
        };
        isActive: boolean;
        emailVerified: boolean;
        phone: string;
        lastLoginAt: Date;
        createdAt: Date;
    }>;
    createUser(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role?: string;
        companyId: string;
    }): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        companyId: string;
    }>;
    updateUserRole(userId: string, role: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
    }>;
    updateUser(id: string, dto: any): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        isActive: boolean;
        companyId: string;
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
                users: number;
                tickets: number;
                assets: number;
            };
        } & import("@prisma/client/runtime").GetResult<{
            id: string;
            name: string;
            slug: string;
            domain: string | null;
            logo: string | null;
            settings: string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
            branding: string | null;
            inviteCode: string | null;
            inviteExpiresAt: Date | null;
        }, unknown> & {})[];
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
    }): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        slug: string;
        domain: string | null;
        logo: string | null;
        settings: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        branding: string | null;
        inviteCode: string | null;
        inviteExpiresAt: Date | null;
    }, unknown> & {}>;
    updateCompany(id: string, dto: any): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        slug: string;
        domain: string | null;
        logo: string | null;
        settings: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        branding: string | null;
        inviteCode: string | null;
        inviteExpiresAt: Date | null;
    }, unknown> & {}>;
    removeCompany(id: string): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        slug: string;
        domain: string | null;
        logo: string | null;
        settings: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        branding: string | null;
        inviteCode: string | null;
        inviteExpiresAt: Date | null;
    }, unknown> & {}>;
    generateInviteCode(companyId: string, expiresInDays?: number): Promise<{
        id: string;
        name: string;
        inviteCode: string;
        inviteExpiresAt: Date;
    }>;
    listCompanyUsers(companyId: string, query: {
        page?: number;
        limit?: number;
        search?: string;
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
    updateCompanyUserRole(userId: string, role: string, companyId: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
    }>;
    getCompanyUser(userId: string, companyId: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
        userType: string;
        isActive: boolean;
        emailVerified: boolean;
        phone: string;
        lastLoginAt: Date;
        createdAt: Date;
    }>;
    getCompanySettings(companyId: string): Promise<{
        settings: any;
        branding: any;
        id: string;
        name: string;
        slug: string;
        domain: string;
        logo: string;
        inviteCode: string;
        inviteExpiresAt: Date;
    }>;
    updateCompanySettings(companyId: string, dto: any): Promise<{
        id: string;
        name: string;
        domain: string;
        logo: string;
        branding: string;
        settings: string;
    }>;
    createCompanyUser(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role?: string;
    }, companyId: string): Promise<{
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: string;
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
            actor: {
                id: string;
                firstName: string;
                lastName: string;
                email: string;
            };
            company: {
                id: string;
                name: string;
            };
        } & import("@prisma/client/runtime").GetResult<{
            id: string;
            companyId: string;
            actorId: string;
            action: string;
            resourceType: string;
            resourceId: string;
            diff: string | null;
            ip: string | null;
            userAgent: string | null;
            createdAt: Date;
        }, unknown> & {})[];
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
        usersByType: (import(".prisma/client").Prisma.PickArray<import(".prisma/client").Prisma.UserGroupByOutputType, "userType"[]> & {
            _count: number;
        })[];
        ticketsByStatus: (import(".prisma/client").Prisma.PickArray<import(".prisma/client").Prisma.TicketGroupByOutputType, "status"[]> & {
            _count: number;
        })[];
    }>;
}
