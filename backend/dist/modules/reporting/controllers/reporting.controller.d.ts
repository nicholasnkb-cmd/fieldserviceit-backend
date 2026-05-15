import { ReportingService } from '../services/reporting.service';
export declare class ReportingController {
    private reportingService;
    constructor(reportingService: ReportingService);
    getTicketSummary(from: string, to: string, user: any): Promise<{
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
    getSlaCompliance(user: any): Promise<{
        total: number;
        compliant: number;
        rate: number;
    }>;
    getTechnicianPerformance(user: any): Promise<{
        id: string;
        name: string;
        resolvedTickets: number;
        avgResolutionTime: number;
        totalDispatches: number;
    }[]>;
    getAssetInventory(user: any): Promise<(import(".prisma/client").Prisma.PickArray<import(".prisma/client").Prisma.AssetGroupByOutputType, "assetType"[]> & {
        _count: number;
    })[]>;
    getActivityFeed(user: any): Promise<({
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
}
