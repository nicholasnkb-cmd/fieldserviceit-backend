import { PrismaService } from '../../../database/prisma.service';
export declare class CompaniesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: {
        name: string;
        slug: string;
        domain?: string;
    }): Promise<import("mysql2").RowDataPacket>;
    findAll(query: {
        page?: number;
        limit?: number;
    }): Promise<{
        data: any;
        meta: {
            page: number;
            limit: number;
            total: any;
            totalPages: number;
        };
    }>;
    findOne(id: string): Promise<import("mysql2").RowDataPacket>;
    update(id: string, dto: any): Promise<import("mysql2").RowDataPacket>;
    remove(id: string): Promise<import("mysql2").RowDataPacket>;
    getStats(id: string): Promise<{
        tickets: any;
        users: any;
        assets: any;
        dispatches: any;
    }>;
}
