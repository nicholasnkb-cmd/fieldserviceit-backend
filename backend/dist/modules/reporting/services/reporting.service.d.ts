import { PrismaService } from '../../../database/prisma.service';
export declare class ReportingService {
    private prisma;
    constructor(prisma: PrismaService);
    getTicketSummary(companyId: string, from?: string, to?: string): Promise<{
        total: number;
        byStatus: (import(".prisma/client").Prisma.PickArray<import(".prisma/client").Prisma.TicketGroupByOutputType, "status"[]> & {
            _count: number;
        })[];
        byPriority: (import(".prisma/client").Prisma.PickArray<import(".prisma/client").Prisma.TicketGroupByOutputType, "priority"[]> & {
            _count: number;
        })[];
        resolvedToday: number;
        avgResolutionTime: number;
    }>;
    getSlaCompliance(companyId: string): Promise<{
        total: number;
        compliant: number;
        rate: number;
    }>;
    getTechnicianPerformance(companyId: string): Promise<{
        id: string;
        name: string;
        resolvedTickets: number;
        avgResolutionTime: number;
        totalDispatches: number;
    }[]>;
    getAssetInventory(companyId: string): Promise<(import(".prisma/client").Prisma.PickArray<import(".prisma/client").Prisma.AssetGroupByOutputType, "assetType"[]> & {
        _count: number;
    })[]>;
    getActivityFeed(companyId: string, limit?: number): Promise<({
        actor: {
            id: string;
            firstName: string;
            lastName: string;
        };
        ticket: {
            id: string;
            ticketNumber: string;
            title: string;
            status: string;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketId: string;
        action: string;
        actorId: string;
        oldValue: string | null;
        newValue: string | null;
        comment: string | null;
        isInternal: boolean;
        createdAt: Date;
    }, unknown> & {})[]>;
    private calculateAvgResolution;
}
