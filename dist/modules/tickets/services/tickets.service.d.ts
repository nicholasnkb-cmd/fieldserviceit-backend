import { PrismaService } from '../../../database/prisma.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { UpdateTicketDto } from '../dto/update-ticket.dto';
import { TicketsGateway } from '../events/tickets.gateway';
import { TicketTimelineService } from './ticket-timeline.service';
import { EmailService } from '../../notifications/services/email.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
export declare class TicketsService {
    private prisma;
    private gateway;
    private timeline;
    private emailService;
    private notificationsService;
    constructor(prisma: PrismaService, gateway: TicketsGateway, timeline: TicketTimelineService, emailService: EmailService, notificationsService: NotificationsService);
    private validateTransition;
    create(dto: CreateTicketDto, companyId: string | null, userId: string, userType: string): Promise<any>;
    findAll(user: any, query: {
        page?: number;
        limit?: number;
        status?: string;
        search?: string;
    }): Promise<{
        data: any[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findOne(id: string, user: any): Promise<any>;
    update(id: string, dto: UpdateTicketDto, companyId: string, userId?: string): Promise<any>;
    remove(id: string, companyId: string): Promise<any>;
    assign(id: string, targetUserId: string, companyId: string, actorUserId?: string): Promise<any>;
    resolve(id: string, resolution: string, companyId: string, userId?: string): Promise<any>;
}
