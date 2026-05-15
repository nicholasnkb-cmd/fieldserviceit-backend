import { ReportingService } from '../services/reporting.service';
export declare class ReportingController {
    private reportingService;
    constructor(reportingService: ReportingService);
    getTicketSummary(from: string, to: string, user: any): Promise<{
        total: any;
        byStatus: any;
        byPriority: any;
        resolvedToday: any;
        avgResolutionTime: number;
    }>;
    getSlaCompliance(user: any): Promise<{
        total: number;
        compliant: number;
        rate: number;
    }>;
    getTechnicianPerformance(user: any): Promise<{
        id: any;
        name: string;
        resolvedTickets: any;
        avgResolutionTime: number;
        totalDispatches: any;
    }[]>;
    getAssetInventory(user: any): Promise<any>;
    getActivityFeed(user: any): Promise<import("mysql2").RowDataPacket[]>;
}
