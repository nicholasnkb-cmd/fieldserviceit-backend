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
    }): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        userId: string;
        companyId: string;
        title: string;
        body: string | null;
        type: string;
        isRead: boolean;
        link: string | null;
        createdAt: Date;
    }, unknown> & {}>;
    findAll(userId: string, query: {
        page?: number;
        limit?: number;
        unreadOnly?: boolean;
    }): Promise<{
        data: (import("@prisma/client/runtime").GetResult<{
            id: string;
            userId: string;
            companyId: string;
            title: string;
            body: string | null;
            type: string;
            isRead: boolean;
            link: string | null;
            createdAt: Date;
        }, unknown> & {})[];
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
