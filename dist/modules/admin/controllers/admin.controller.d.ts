import { AdminService } from '../services/admin.service';
export declare class AdminController {
    private adminService;
    constructor(adminService: AdminService);
    listPermissions(): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        description: string | null;
        group: string | null;
    }[]>;
    listRoles(user: any): Promise<({
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
    getRole(id: string): Promise<{
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
    updateRole(id: string, dto: {
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
    deleteRole(id: string): Promise<{
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
    getUserRoles(id: string): Promise<({
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
    listUsers(query: any): Promise<{
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
    updateUserRole(id: string, role: string): Promise<{
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
    listCompanies(query: any): Promise<{
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
    generateInviteCode(id: string, expiresInDays?: number): Promise<{
        name: string;
        id: string;
        inviteCode: string;
        inviteExpiresAt: Date;
    }>;
    listAuditLogs(query: any): Promise<{
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
    getStats(): Promise<{
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
    listCompanyRoles(user: any): Promise<({
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
    createCompanyRole(dto: {
        name: string;
        slug: string;
        description?: string;
        permissionSlugs?: string[];
    }, user: any): Promise<{
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
    updateCompanyRole(id: string, dto: {
        name?: string;
        description?: string;
        permissionSlugs?: string[];
    }, user: any): Promise<{
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
    deleteCompanyRole(id: string): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        slug: string;
        description: string | null;
        companyId: string | null;
        isSystem: boolean;
        updatedAt: Date;
    }>;
    listCompanyUsers(query: any, user: any): Promise<{
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
    createCompanyUser(dto: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role?: string;
    }, user: any): Promise<{
        role: string;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    getCompanyUser(id: string, user: any): Promise<{
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
    updateCompanyUserRole(id: string, role: string, user: any): Promise<{
        role: string;
        id: string;
        email: string;
        firstName: string;
        lastName: string;
    }>;
    removeCompanyUser(id: string, user: any): Promise<{
        id: string;
        email: string;
    }>;
    generateCompanyInviteCode(user: any, expiresInDays?: number): Promise<{
        name: string;
        id: string;
        inviteCode: string;
        inviteExpiresAt: Date;
    }>;
    getCompanySettings(user: any): Promise<{
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
    updateCompanySettings(dto: any, user: any): Promise<{
        name: string;
        id: string;
        domain: string;
        logo: string;
        settings: string;
        branding: string;
    }>;
}
