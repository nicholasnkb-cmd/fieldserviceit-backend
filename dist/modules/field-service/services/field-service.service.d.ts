import { PrismaService } from '../../../database/prisma.service';
import { TicketsGateway } from '../../tickets/events/tickets.gateway';
export declare class FieldServiceService {
    private prisma;
    private gateway;
    constructor(prisma: PrismaService, gateway: TicketsGateway);
    dispatch(ticketId: string, technicianId: string, companyId: string): Promise<any>;
    getDispatchBoard(companyId: string): Promise<import("mysql2").RowDataPacket[]>;
    updateStatus(id: string, status: string, companyId: string): Promise<any>;
    addNotes(id: string, notes: string, companyId: string): Promise<any>;
    addSignature(id: string, signature: string, companyId: string): Promise<any>;
    addPhotos(id: string, photoUrls: string[], companyId: string): Promise<any>;
}
