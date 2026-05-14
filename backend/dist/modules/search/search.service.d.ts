import { PrismaService } from '../../database/prisma.service';
export declare class SearchService {
    private prisma;
    constructor(prisma: PrismaService);
    search(companyId: string | null, query: string, userType: string, userId: string): Promise<{
        tickets: {
            createdAt: Date;
            id: string;
            priority: string;
            ticketNumber: string;
            title: string;
            category: string;
            status: string;
        }[];
        assets: {
            name: string;
            id: string;
            location: string;
            status: string;
            assetType: string;
            serialNumber: string;
        }[];
    }>;
    private searchTickets;
    private searchAssets;
}
