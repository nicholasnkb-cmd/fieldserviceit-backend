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
    create(dto: CreateTicketDto, user: any): Promise<{
        asset: {
            createdAt: Date;
            name: string;
            id: string;
            companyId: string;
            updatedAt: Date;
            deletedAt: Date | null;
            location: string | null;
            status: string;
            ipAddress: string | null;
            assetType: string;
            serialNumber: string | null;
            manufacturer: string | null;
            model: string | null;
            macAddress: string | null;
            os: string | null;
            cpu: string | null;
            ram: string | null;
            storage: string | null;
            notes: string | null;
        };
        assignedTo: {
            id: string;
            firstName: string;
            lastName: string;
        };
        createdBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        description: string | null;
        companyId: string | null;
        updatedAt: Date;
        priority: string;
        deletedAt: Date | null;
        ticketNumber: string;
        title: string;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        type: string;
        createdById: string;
        assignedToId: string | null;
        assetId: string | null;
        slaId: string | null;
        contractId: string | null;
        trackingToken: string | null;
        onHoldReason: string | null;
        resolution: string | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
    }>;
    findAll(query: any, user: any): Promise<{
        data: ({
            asset: {
                name: string;
                id: string;
                assetType: string;
            };
            assignedTo: {
                id: string;
                firstName: string;
                lastName: string;
            };
            createdBy: {
                id: string;
                firstName: string;
                lastName: string;
            };
            resolvedBy: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & {
            createdAt: Date;
            id: string;
            description: string | null;
            companyId: string | null;
            updatedAt: Date;
            priority: string;
            deletedAt: Date | null;
            ticketNumber: string;
            title: string;
            contactName: string | null;
            contactEmail: string | null;
            contactPhone: string | null;
            category: string | null;
            subcategory: string | null;
            location: string | null;
            latitude: number | null;
            longitude: number | null;
            status: string;
            type: string;
            createdById: string;
            assignedToId: string | null;
            assetId: string | null;
            slaId: string | null;
            contractId: string | null;
            trackingToken: string | null;
            onHoldReason: string | null;
            resolution: string | null;
            resolvedAt: Date | null;
            resolvedById: string | null;
        })[];
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
            tickets: {
                createdAt: Date;
                id: string;
                priority: string;
                ticketNumber: string;
                title: string;
                contactName: string;
                category: string;
                status: string;
                assignedTo: {
                    id: string;
                    firstName: string;
                    lastName: string;
                };
            }[];
        }[];
    }>;
    findOne(id: string, user: any): Promise<{
        asset: {
            createdAt: Date;
            name: string;
            id: string;
            companyId: string;
            updatedAt: Date;
            deletedAt: Date | null;
            location: string | null;
            status: string;
            ipAddress: string | null;
            assetType: string;
            serialNumber: string | null;
            manufacturer: string | null;
            model: string | null;
            macAddress: string | null;
            os: string | null;
            cpu: string | null;
            ram: string | null;
            storage: string | null;
            notes: string | null;
        };
        attachments: ({
            uploadedBy: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & {
            createdAt: Date;
            id: string;
            ticketId: string;
            fileUrl: string;
            fileName: string;
            fileSize: number;
            mimeType: string;
            uploadedById: string;
        })[];
        dispatches: {
            createdAt: Date;
            id: string;
            companyId: string;
            updatedAt: Date;
            latitude: number | null;
            longitude: number | null;
            status: string;
            ticketId: string;
            notes: string | null;
            completedAt: Date | null;
            scheduledAt: Date | null;
            arrivedAt: Date | null;
            customerSignature: string | null;
            photoUrls: string;
            technicianId: string;
        }[];
        sla: {
            createdAt: Date;
            name: string;
            id: string;
            companyId: string;
            updatedAt: Date;
            priority: string;
            isActive: boolean;
            responseTimeMin: number;
            resolutionTimeMin: number;
            escalateAfterMin: number | null;
            escalateToId: string | null;
        };
        assignedTo: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        createdBy: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        resolvedBy: {
            id: string;
            email: string;
            firstName: string;
            lastName: string;
        };
        timeline: ({
            actor: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & {
            createdAt: Date;
            id: string;
            ticketId: string;
            action: string;
            actorId: string;
            oldValue: string | null;
            newValue: string | null;
            comment: string | null;
            isInternal: boolean;
        })[];
    } & {
        createdAt: Date;
        id: string;
        description: string | null;
        companyId: string | null;
        updatedAt: Date;
        priority: string;
        deletedAt: Date | null;
        ticketNumber: string;
        title: string;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        type: string;
        createdById: string;
        assignedToId: string | null;
        assetId: string | null;
        slaId: string | null;
        contractId: string | null;
        trackingToken: string | null;
        onHoldReason: string | null;
        resolution: string | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
    }>;
    update(id: string, dto: UpdateTicketDto, user: any): Promise<{
        assignedTo: {
            id: string;
            firstName: string;
            lastName: string;
        };
        createdBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
        resolvedBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        description: string | null;
        companyId: string | null;
        updatedAt: Date;
        priority: string;
        deletedAt: Date | null;
        ticketNumber: string;
        title: string;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        type: string;
        createdById: string;
        assignedToId: string | null;
        assetId: string | null;
        slaId: string | null;
        contractId: string | null;
        trackingToken: string | null;
        onHoldReason: string | null;
        resolution: string | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
    }>;
    remove(id: string, user: any): Promise<{
        createdAt: Date;
        id: string;
        description: string | null;
        companyId: string | null;
        updatedAt: Date;
        priority: string;
        deletedAt: Date | null;
        ticketNumber: string;
        title: string;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        type: string;
        createdById: string;
        assignedToId: string | null;
        assetId: string | null;
        slaId: string | null;
        contractId: string | null;
        trackingToken: string | null;
        onHoldReason: string | null;
        resolution: string | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
    }>;
    assign(id: string, userId: string, user: any): Promise<{
        assignedTo: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        description: string | null;
        companyId: string | null;
        updatedAt: Date;
        priority: string;
        deletedAt: Date | null;
        ticketNumber: string;
        title: string;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        type: string;
        createdById: string;
        assignedToId: string | null;
        assetId: string | null;
        slaId: string | null;
        contractId: string | null;
        trackingToken: string | null;
        onHoldReason: string | null;
        resolution: string | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
    }>;
    resolve(id: string, resolution: string, user: any): Promise<{
        resolvedBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        description: string | null;
        companyId: string | null;
        updatedAt: Date;
        priority: string;
        deletedAt: Date | null;
        ticketNumber: string;
        title: string;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        type: string;
        createdById: string;
        assignedToId: string | null;
        assetId: string | null;
        slaId: string | null;
        contractId: string | null;
        trackingToken: string | null;
        onHoldReason: string | null;
        resolution: string | null;
        resolvedAt: Date | null;
        resolvedById: string | null;
    }>;
    addComment(id: string, dto: CreateCommentDto, user: any): Promise<{
        actor: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        ticketId: string;
        action: string;
        actorId: string;
        oldValue: string | null;
        newValue: string | null;
        comment: string | null;
        isInternal: boolean;
    }>;
    getTimeline(id: string, user: any): Promise<({
        actor: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        ticketId: string;
        action: string;
        actorId: string;
        oldValue: string | null;
        newValue: string | null;
        comment: string | null;
        isInternal: boolean;
    })[]>;
    addAttachment(id: string, body: {
        fileUrl: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
    }, user: any): Promise<{
        uploadedBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        ticketId: string;
        fileUrl: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        uploadedById: string;
    }>;
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
    listTemplates(user: any): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        description: string | null;
        companyId: string;
        updatedAt: Date;
        priority: string | null;
        isActive: boolean;
        title: string | null;
        category: string | null;
        subcategory: string | null;
        body: string | null;
    }[]>;
    createTemplate(body: {
        name: string;
        description?: string;
        category?: string;
        subcategory?: string;
        priority?: string;
        title?: string;
        body?: string;
    }, user: any): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        description: string | null;
        companyId: string;
        updatedAt: Date;
        priority: string | null;
        isActive: boolean;
        title: string | null;
        category: string | null;
        subcategory: string | null;
        body: string | null;
    }>;
    deleteTemplate(id: string): Promise<{
        success: boolean;
    }>;
    addTimeEntry(id: string, body: {
        duration: number;
        description?: string;
        billable?: boolean;
        startTime?: string;
    }, user: any): Promise<{
        userId: string;
        createdAt: Date;
        id: string;
        description: string | null;
        ticketId: string;
        startTime: Date;
        endTime: Date | null;
        duration: number | null;
        billable: boolean;
    }>;
    getTimeEntries(id: string): Promise<({
        user: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        userId: string;
        createdAt: Date;
        id: string;
        description: string | null;
        ticketId: string;
        startTime: Date;
        endTime: Date | null;
        duration: number | null;
        billable: boolean;
    })[]>;
    inboundEmail(body: {
        from: string;
        subject: string;
        text: string;
        html?: string;
    }, apiKey?: string): Promise<{
        ticketNumber: string;
        id: string;
    }>;
}
