import { CompaniesService } from '../services/companies.service';
export declare class CompaniesController {
    private companiesService;
    constructor(companiesService: CompaniesService);
    create(dto: any): Promise<import("@prisma/client/runtime").GetResult<{
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
    findAll(query: any, user: any): Promise<{
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
    }> | Promise<{
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
    findOne(id: string, user: any): Promise<{
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
    getStats(id: string, user: any): Promise<{
        tickets: number;
        users: number;
        assets: number;
        dispatches: number;
    }>;
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
}
