import { PrismaService } from '../../../database/prisma.service';
export declare class CmdbService {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: any, companyId: string): Promise<import("mysql2").RowDataPacket>;
    findAll(companyId: string, query: {
        page?: number;
        limit?: number;
        assetType?: string;
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
    findOne(id: string, companyId: string): Promise<import("mysql2").RowDataPacket>;
    update(id: string, dto: any, companyId: string): Promise<import("mysql2").RowDataPacket>;
    remove(id: string, companyId: string): Promise<import("mysql2").RowDataPacket>;
}
