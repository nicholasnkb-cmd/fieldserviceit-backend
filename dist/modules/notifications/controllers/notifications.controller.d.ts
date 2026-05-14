import { NotificationsService } from '../services/notifications.service';
export declare class NotificationsController {
    private notificationsService;
    constructor(notificationsService: NotificationsService);
    findAll(query: any, user: any): Promise<{
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
    markAsRead(id: string, user: any): Promise<import(".prisma/client").Prisma.BatchPayload>;
    markAllAsRead(user: any): Promise<import(".prisma/client").Prisma.BatchPayload>;
    unreadCount(user: any): Promise<{
        count: number;
    }>;
}
