import { PrismaService } from '../../../database/prisma.service';
export declare class WorkflowService {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: {
        name: string;
        description?: string;
        triggerOn?: string;
        steps: any[];
    }, companyId: string): Promise<{
        steps: {
            createdAt: Date;
            id: string;
            updatedAt: Date;
            action: string;
            stepOrder: number;
            config: string | null;
            workflowId: string;
        }[];
    } & {
        createdAt: Date;
        name: string;
        id: string;
        description: string | null;
        companyId: string;
        updatedAt: Date;
        isActive: boolean;
        deletedAt: Date | null;
        triggerOn: string;
    }>;
    findAll(companyId: string): Promise<({
        steps: {
            createdAt: Date;
            id: string;
            updatedAt: Date;
            action: string;
            stepOrder: number;
            config: string | null;
            workflowId: string;
        }[];
    } & {
        createdAt: Date;
        name: string;
        id: string;
        description: string | null;
        companyId: string;
        updatedAt: Date;
        isActive: boolean;
        deletedAt: Date | null;
        triggerOn: string;
    })[]>;
    findOne(id: string, companyId: string): Promise<{
        runs: {
            id: string;
            companyId: string;
            status: string;
            ticketId: string;
            workflowId: string;
            startedAt: Date;
            completedAt: Date | null;
        }[];
        steps: {
            createdAt: Date;
            id: string;
            updatedAt: Date;
            action: string;
            stepOrder: number;
            config: string | null;
            workflowId: string;
        }[];
    } & {
        createdAt: Date;
        name: string;
        id: string;
        description: string | null;
        companyId: string;
        updatedAt: Date;
        isActive: boolean;
        deletedAt: Date | null;
        triggerOn: string;
    }>;
    execute(workflowId: string, ticketId: string, companyId: string): Promise<{
        id: string;
        companyId: string;
        status: string;
        ticketId: string;
        workflowId: string;
        startedAt: Date;
        completedAt: Date | null;
    }>;
    getRuns(workflowId: string, companyId: string): Promise<({
        ticket: {
            id: string;
            ticketNumber: string;
            title: string;
        };
        steps: {
            id: string;
            status: string;
            output: string | null;
            startedAt: Date | null;
            completedAt: Date | null;
            runId: string;
            executedById: string | null;
            stepId: string;
        }[];
    } & {
        id: string;
        companyId: string;
        status: string;
        ticketId: string;
        workflowId: string;
        startedAt: Date;
        completedAt: Date | null;
    })[]>;
}
