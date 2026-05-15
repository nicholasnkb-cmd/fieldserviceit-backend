import { NotificationsService } from '../services/notifications.service';
export declare class NotificationsController {
    private notificationsService;
    constructor(notificationsService: NotificationsService);
    findAll(query: any, user: any): Promise<{
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
    markAsRead(id: string, user: any): Promise<import(".prisma/client").Prisma.BatchPayload>;
    markAllAsRead(user: any): Promise<import(".prisma/client").Prisma.BatchPayload>;
    unreadCount(user: any): Promise<{
        count: number;
    }>;
}
