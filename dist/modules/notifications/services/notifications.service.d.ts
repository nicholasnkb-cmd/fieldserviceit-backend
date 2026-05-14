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
    }): Promise<{
        userId: string;
        createdAt: Date;
        id: string;
        companyId: string;
        link: string | null;
        title: string;
        type: string;
        body: string | null;
        isRead: boolean;
    }>;
    findAll(userId: string, query: {
        page?: number;
        limit?: number;
        unreadOnly?: boolean;
    }): Promise<{
        data: {
            userId: string;
            createdAt: Date;
            id: string;
            companyId: string;
            link: string | null;
            title: string;
            type: string;
            body: string | null;
            isRead: boolean;
        }[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    markAsRead(id: string, userId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
    markAllAsRead(userId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
    unreadCount(userId: string): Promise<{
        count: number;
    }>;
}
