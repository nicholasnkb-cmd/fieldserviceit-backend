import { PrismaService } from '../../../database/prisma.service';
export declare class ReportingService {
    private prisma;
    constructor(prisma: PrismaService);
    getTicketSummary(companyId: string, from?: string, to?: string): Promise<{
        total: any;
        byStatus: any;
        byPriority: any;
        resolvedToday: any;
        avgResolutionTime: number;
    }>;
    getSlaCompliance(companyId: string): Promise<{
        total: number;
        compliant: number;
        rate: number;
    }>;
    getTechnicianPerformance(companyId: string): Promise<{
        id: any;
        name: string;
        resolvedTickets: any;
        avgResolutionTime: number;
        totalDispatches: any;
    }[]>;
    getAssetInventory(companyId: string): Promise<any>;
    getActivityFeed(companyId: string, limit?: number): Promise<import("mysql2").RowDataPacket[]>;
    private calculateAvgResolution;
}
