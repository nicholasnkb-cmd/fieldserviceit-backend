import { PrismaService } from '../../database/prisma.service';
export declare class SearchService {
    private prisma;
    constructor(prisma: PrismaService);
    search(companyId: string | null, query: string, userType: string, userId: string): Promise<{
        tickets: {
            id: string;
            ticketNumber: string;
            title: string;
            status: string;
            priority: string;
            category: string;
            createdAt: Date;
        }[];
        assets: {
            id: string;
            name: string;
            assetType: string;
            serialNumber: string;
            status: string;
            location: string;
        }[];
    }>;
    private searchTickets;
    private searchAssets;
}
