import { PrismaService } from '../../../database/prisma.service';
export declare class TicketTimelineService {
    private prisma;
    constructor(prisma: PrismaService);
    addEntry(ticketId: string, actorId: string, action: string, comment?: string, oldValue?: string, newValue?: string, isInternal?: boolean): Promise<import("mysql2").RowDataPacket>;
    getTimeline(ticketId: string): Promise<import("mysql2").RowDataPacket[]>;
}
