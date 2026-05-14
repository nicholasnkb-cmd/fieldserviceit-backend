import { CompaniesService } from '../services/companies.service';
export declare class CompaniesController {
    private companiesService;
    constructor(companiesService: CompaniesService);
    create(dto: any): Promise<{
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
    findAll(query: any, user: any): Promise<{
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
    }> | Promise<{
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
    }>;
    findOne(id: string, user: any): Promise<{
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
    }>;
    getStats(id: string, user: any): Promise<{
        tickets: number;
        users: number;
        assets: number;
        dispatches: number;
    }>;
    update(id: string, dto: any): Promise<{
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
    remove(id: string): Promise<{
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
}
