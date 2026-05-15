import { PrismaService } from '../../../database/prisma.service';
export declare class CompaniesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: {
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
    findAll(query: {
        page?: number;
        limit?: number;
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
    findOne(id: string): Promise<{
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
    }, unknown> & {}>;
    update(id: string, dto: any): Promise<import("@prisma/client/runtime").GetResult<{
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
    remove(id: string): Promise<import("@prisma/client/runtime").GetResult<{
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
    getStats(id: string): Promise<{
        tickets: number;
        users: number;
        assets: number;
        dispatches: number;
    }>;
}
