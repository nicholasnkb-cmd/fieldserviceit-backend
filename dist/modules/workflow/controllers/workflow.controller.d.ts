import { WorkflowService } from '../services/workflow.service';
export declare class WorkflowController {
    private workflowService;
    constructor(workflowService: WorkflowService);
    create(dto: any, user: any): Promise<{
        steps: (import("@prisma/client/runtime").GetResult<{
            id: string;
            workflowId: string;
            stepOrder: number;
            action: string;
            config: string | null;
            createdAt: Date;
            updatedAt: Date;
        }, unknown> & {})[];
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        description: string | null;
        triggerOn: string;
        companyId: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    findAll(user: any): Promise<({
        steps: (import("@prisma/client/runtime").GetResult<{
            id: string;
            workflowId: string;
            stepOrder: number;
            action: string;
            config: string | null;
            createdAt: Date;
            updatedAt: Date;
        }, unknown> & {})[];
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        description: string | null;
        triggerOn: string;
        companyId: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {})[]>;
    findOne(id: string, user: any): Promise<{
        steps: (import("@prisma/client/runtime").GetResult<{
            id: string;
            workflowId: string;
            stepOrder: number;
            action: string;
            config: string | null;
            createdAt: Date;
            updatedAt: Date;
        }, unknown> & {})[];
        runs: (import("@prisma/client/runtime").GetResult<{
            id: string;
            workflowId: string;
            ticketId: string;
            companyId: string;
            status: string;
            startedAt: Date;
            completedAt: Date | null;
        }, unknown> & {})[];
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        name: string;
        description: string | null;
        triggerOn: string;
        companyId: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }, unknown> & {}>;
    execute(id: string, ticketId: string, user: any): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        workflowId: string;
        ticketId: string;
        companyId: string;
        status: string;
        startedAt: Date;
        completedAt: Date | null;
    }, unknown> & {}>;
    getRuns(id: string, user: any): Promise<({
        steps: (import("@prisma/client/runtime").GetResult<{
            id: string;
            runId: string;
            stepId: string;
            status: string;
            executedById: string | null;
            output: string | null;
            startedAt: Date | null;
            completedAt: Date | null;
        }, unknown> & {})[];
        ticket: {
            id: string;
            ticketNumber: string;
            title: string;
        };
    } & import("@prisma/client/runtime").GetResult<{
        id: string;
        workflowId: string;
        ticketId: string;
        companyId: string;
        status: string;
        startedAt: Date;
        completedAt: Date | null;
    }, unknown> & {})[]>;
}
