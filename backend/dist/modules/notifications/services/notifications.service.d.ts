import { PrismaService } from '../../../database/prisma.service';
export declare class NotificationsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: {
        userId: string;
        companyId: string;
        title: string;
        body?: string;
        type?: string;
        link?: string;
    }): Promise<import("mysql2").RowDataPacket>;
    findAll(userId: string, query: {
        page?: number;
        limit?: number;
        unreadOnly?: boolean;
    }): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    markAsRead(id: string, userId: string): Promise<any>;
    markAllAsRead(userId: string): Promise<any>;
    unreadCount(userId: string): Promise<{
        count: number;
    }>;
}
