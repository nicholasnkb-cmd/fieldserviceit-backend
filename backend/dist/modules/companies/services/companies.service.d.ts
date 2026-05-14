import { PrismaService } from '../../../database/prisma.service';
export declare class CompaniesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: {
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
    findAll(query: {
        page?: number;
        limit?: number;
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
    findOne(id: string): Promise<{
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
    getStats(id: string): Promise<{
        tickets: number;
        users: number;
        assets: number;
        dispatches: number;
    }>;
}
