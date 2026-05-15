import { PrismaService } from '../../database/prisma.service';
export declare class SearchService {
    private prisma;
    constructor(prisma: PrismaService);
    search(companyId: string | null, query: string, userType: string, userId: string): Promise<{
        tickets: any[];
        assets: import("mysql2").RowDataPacket[];
    }>;
    private searchTickets;
    private searchAssets;
}
