import { PrismaService } from '../../../database/prisma.service';
import { RmmProviderFactory } from './rmm-provider-factory.service';
import { TicketTimelineService } from '../../tickets/services/ticket-timeline.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { TicketsGateway } from '../../tickets/events/tickets.gateway';
export declare class RmmIntegrationService {
    private prisma;
    private providerFactory;
    private timeline;
    private notificationsService;
    private gateway;
    private readonly logger;
    constructor(prisma: PrismaService, providerFactory: RmmProviderFactory, timeline: TicketTimelineService, notificationsService: NotificationsService, gateway: TicketsGateway);
    syncAsset(provider: string, assetData: any, companyId: string): Promise<import("mysql2").RowDataPacket>;
    createTicketFromAlert(provider: string, alert: any, companyId: string): Promise<any>;
    private mapPriority;
}
