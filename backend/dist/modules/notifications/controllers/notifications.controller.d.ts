import { NotificationsService } from '../services/notifications.service';
export declare class NotificationsController {
    private notificationsService;
    constructor(notificationsService: NotificationsService);
    findAll(query: any, user: any): Promise<{
        data: import("mysql2").RowDataPacket[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    markAsRead(id: string, user: any): Promise<{
        count: number;
    }>;
    markAllAsRead(user: any): Promise<{
        count: number;
    }>;
    unreadCount(user: any): Promise<{
        count: number;
    }>;
}
