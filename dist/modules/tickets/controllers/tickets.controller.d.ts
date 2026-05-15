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
        createdBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
        assignedTo: {
            id: string;
            firstName: string;
            lastName: string;
        };
        asset: import("@prisma/client/runtime").GetResult<{
            id: string;
            name: string;
            assetType: string;
            serialNumber: string | null;
            manufacturer: string | null;
            model: string | null;
            location: string | null;
            ipAddress: string | null;
            macAddress: string | null;
            os: string | null;
            cpu: string | null;
            ram: string | null;
            storage: string | null;
            status: string;
            notes: string | null;
            companyId: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        }, unknown> & {};
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketNumber: string;
        title: string;
        description: string | null;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        priority: string;
        type: string;
        companyId: string | null;
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
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    findAll(query: any, user: any): Promise<{
        data: ({
            createdBy: {
                id: string;
                firstName: string;
                lastName: string;
            };
            assignedTo: {
                id: string;
                firstName: string;
                lastName: string;
            };
            resolvedBy: {
                id: string;
                firstName: string;
                lastName: string;
            };
            asset: {
                id: string;
                name: string;
                assetType: string;
            };
        } & import("@prisma/client/runtime").GetResult<{
            id: string;
            ticketNumber: string;
            title: string;
            description: string | null;
            contactName: string | null;
            contactEmail: string | null;
            contactPhone: string | null;
            category: string | null;
            subcategory: string | null;
            location: string | null;
            latitude: number | null;
            longitude: number | null;
            status: string;
            priority: string;
            type: string;
            companyId: string | null;
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
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        }, unknown> & {})[];
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
                id: string;
                ticketNumber: string;
                title: string;
                status: string;
                priority: string;
                contactName: string;
                category: string;
                assignedTo: {
                    id: string;
                    firstName: string;
                    lastName: string;
                };
                createdAt: Date;
            }[];
        }[];
    }>;
    findOne(id: string, user: any): Promise<{
        createdBy: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
        };
        assignedTo: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
        };
        resolvedBy: {
            id: string;
            firstName: string;
            lastName: string;
            email: string;
        };
        asset: import("@prisma/client/runtime").GetResult<{
            id: string;
            name: string;
            assetType: string;
            serialNumber: string | null;
            manufacturer: string | null;
            model: string | null;
            location: string | null;
            ipAddress: string | null;
            macAddress: string | null;
            os: string | null;
            cpu: string | null;
            ram: string | null;
            storage: string | null;
            status: string;
            notes: string | null;
            companyId: string;
            createdAt: Date;
            updatedAt: Date;
            deletedAt: Date | null;
        }, unknown> & {};
        sla: import("@prisma/client/runtime").GetResult<{
            id: string;
            name: string;
            companyId: string;
            responseTimeMin: number;
            resolutionTimeMin: number;
            priority: string;
            escalateAfterMin: number | null;
            escalateToId: string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        }, unknown> & {};
        timeline: ({
            actor: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & import("@prisma/client/runtime").GetResult<{
            id: string;
            ticketId: string;
            action: string;
            actorId: string;
            oldValue: string | null;
            newValue: string | null;
            comment: string | null;
            isInternal: boolean;
            createdAt: Date;
        }, unknown> & {})[];
        attachments: ({
            uploadedBy: {
                id: string;
                firstName: string;
                lastName: string;
            };
        } & import("@prisma/client/runtime").GetResult<{
            id: string;
            ticketId: string;
            fileUrl: string;
            fileName: string;
            fileSize: number;
            mimeType: string;
            uploadedById: string;
            createdAt: Date;
        }, unknown> & {})[];
        dispatches: (import("@prisma/client/runtime").GetResult<{
            id: string;
            ticketId: string;
            technicianId: string;
            companyId: string;
            status: string;
            scheduledAt: Date | null;
            arrivedAt: Date | null;
            completedAt: Date | null;
            notes: string | null;
            customerSignature: string | null;
            photoUrls: string;
            latitude: number | null;
            longitude: number | null;
            createdAt: Date;
            updatedAt: Date;
        }, unknown> & {})[];
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketNumber: string;
        title: string;
        description: string | null;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        priority: string;
        type: string;
        companyId: string | null;
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
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    update(id: string, dto: UpdateTicketDto, user: any): Promise<{
        createdBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
        assignedTo: {
            id: string;
            firstName: string;
            lastName: string;
        };
        resolvedBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketNumber: string;
        title: string;
        description: string | null;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        priority: string;
        type: string;
        companyId: string | null;
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
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    remove(id: string, user: any): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketNumber: string;
        title: string;
        description: string | null;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        priority: string;
        type: string;
        companyId: string | null;
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
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    assign(id: string, userId: string, user: any): Promise<{
        assignedTo: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketNumber: string;
        title: string;
        description: string | null;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        priority: string;
        type: string;
        companyId: string | null;
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
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    resolve(id: string, resolution: string, user: any): Promise<{
        resolvedBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketNumber: string;
        title: string;
        description: string | null;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        priority: string;
        type: string;
        companyId: string | null;
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
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    addComment(id: string, dto: CreateCommentDto, user: any): Promise<{
        actor: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketId: string;
        action: string;
        actorId: string;
        oldValue: string | null;
        newValue: string | null;
        comment: string | null;
        isInternal: boolean;
        createdAt: Date;
    }, unknown> & {}>;
    getTimeline(id: string, user: any): Promise<({
        actor: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketId: string;
        action: string;
        actorId: string;
        oldValue: string | null;
        newValue: string | null;
        comment: string | null;
        isInternal: boolean;
        createdAt: Date;
    }, unknown> & {})[]>;
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
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketId: string;
        fileUrl: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        uploadedById: string;
        createdAt: Date;
    }, unknown> & {}>;
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
    listTemplates(user: any): Promise<(import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        description: string | null;
        category: string | null;
        subcategory: string | null;
        priority: string | null;
        title: string | null;
        body: string | null;
        companyId: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {})[]>;
    createTemplate(body: {
        name: string;
        description?: string;
        category?: string;
        subcategory?: string;
        priority?: string;
        title?: string;
        body?: string;
    }, user: any): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        description: string | null;
        category: string | null;
        subcategory: string | null;
        priority: string | null;
        title: string | null;
        body: string | null;
        companyId: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {}>;
    deleteTemplate(id: string): Promise<{
        success: boolean;
    }>;
    addTimeEntry(id: string, body: {
        duration: number;
        description?: string;
        billable?: boolean;
        startTime?: string;
    }, user: any): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketId: string;
        userId: string;
        startTime: Date;
        endTime: Date | null;
        duration: number | null;
        description: string | null;
        billable: boolean;
        createdAt: Date;
    }, unknown> & {}>;
    getTimeEntries(id: string): Promise<({
        user: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        ticketId: string;
        userId: string;
        startTime: Date;
        endTime: Date | null;
        duration: number | null;
        description: string | null;
        billable: boolean;
        createdAt: Date;
    }, unknown> & {})[]>;
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
