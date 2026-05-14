import { PrismaService } from '../../../database/prisma.service';
export declare class TicketTimelineService {
    private prisma;
    constructor(prisma: PrismaService);
    addEntry(ticketId: string, actorId: string, action: string, comment?: string, oldValue?: string, newValue?: string, isInternal?: boolean): Promise<{
        actor: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        ticketId: string;
        action: string;
        actorId: string;
        oldValue: string | null;
        newValue: string | null;
        comment: string | null;
        isInternal: boolean;
    }>;
    getTimeline(ticketId: string): Promise<({
        actor: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        ticketId: string;
        action: string;
        actorId: string;
        oldValue: string | null;
        newValue: string | null;
        comment: string | null;
        isInternal: boolean;
    })[]>;
}
