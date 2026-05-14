import { WorkflowService } from '../services/workflow.service';
export declare class WorkflowController {
    private workflowService;
    constructor(workflowService: WorkflowService);
    create(dto: any, user: any): Promise<{
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
    findAll(user: any): Promise<({
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
    findOne(id: string, user: any): Promise<{
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
    execute(id: string, ticketId: string, user: any): Promise<{
        id: string;
        companyId: string;
        status: string;
        ticketId: string;
        workflowId: string;
        startedAt: Date;
        completedAt: Date | null;
    }>;
    getRuns(id: string, user: any): Promise<({
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
