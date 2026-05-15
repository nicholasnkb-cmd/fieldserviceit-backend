import { Response } from 'express';
import { TicketsService } from '../services/tickets.service';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { UpdateTicketDto } from '../dto/update-ticket.dto';
import { CreateCommentDto } from '../dto/create-comment.dto';
import { TicketTimelineService } from '../services/ticket-timeline.service';
import { TicketExportService } from '../services/ticket-export.service';
import { PrismaService } from '../../../database/prisma.service';
export declare class TicketsController {
    private ticketsService;
    private timelineService;
    private exportService;
    private prisma;
    constructor(ticketsService: TicketsService, timelineService: TicketTimelineService, exportService: TicketExportService, prisma: PrismaService);
    create(dto: CreateTicketDto, user: any): Promise<any>;
    findAll(query: any, user: any): Promise<{
        data: any[];
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    exportCsv(status: string, user: any, res: Response): Promise<void>;
    getBoard(user: any): Promise<{
        columns: {
            status: string;
            tickets: any[];
        }[];
    }>;
    findOne(id: string, user: any): Promise<any>;
    update(id: string, dto: UpdateTicketDto, user: any): Promise<any>;
    remove(id: string, user: any): Promise<any>;
    assign(id: string, userId: string, user: any): Promise<any>;
    resolve(id: string, resolution: string, user: any): Promise<any>;
    addComment(id: string, dto: CreateCommentDto, user: any): Promise<import("mysql2").RowDataPacket>;
    getTimeline(id: string, user: any): Promise<import("mysql2").RowDataPacket[]>;
    addAttachment(id: string, body: {
        fileUrl: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
    }, user: any): Promise<import("mysql2").RowDataPacket>;
    removeAttachment(id: string, attachmentId: string): Promise<{
        success: boolean;
    }>;
    bulkStatus(body: {
        ids: string[];
        status: string;
    }, user: any): Promise<{
        results: any[];
    }>;
    bulkAssign(body: {
        ids: string[];
        userId: string;
    }, user: any): Promise<{
        results: any[];
    }>;
    bulkDelete(body: {
        ids: string[];
    }, user: any): Promise<{
        results: any[];
    }>;
    listTemplates(user: any): Promise<import("mysql2").RowDataPacket[]>;
    createTemplate(body: {
        name: string;
        description?: string;
        category?: string;
        subcategory?: string;
        priority?: string;
        title?: string;
        body?: string;
    }, user: any): Promise<import("mysql2").RowDataPacket>;
    deleteTemplate(id: string): Promise<{
        success: boolean;
    }>;
    addTimeEntry(id: string, body: {
        duration: number;
        description?: string;
        billable?: boolean;
        startTime?: string;
    }, user: any): Promise<import("mysql2").RowDataPacket>;
    getTimeEntries(id: string): Promise<import("mysql2").RowDataPacket[]>;
    inboundEmail(body: {
        from: string;
        subject: string;
        text: string;
        html?: string;
    }, apiKey?: string): Promise<{
        ticketNumber: string;
        id: any;
    }>;
}
