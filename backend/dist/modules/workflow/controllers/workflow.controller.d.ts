import { WorkflowService } from '../services/workflow.service';
export declare class WorkflowController {
    private workflowService;
    constructor(workflowService: WorkflowService);
    create(dto: any, user: any): Promise<import("mysql2").RowDataPacket>;
    findAll(user: any): Promise<import("mysql2").RowDataPacket[]>;
    findOne(id: string, user: any): Promise<import("mysql2").RowDataPacket>;
    execute(id: string, ticketId: string, user: any): Promise<import("mysql2").RowDataPacket>;
    getRuns(id: string, user: any): Promise<import("mysql2").RowDataPacket[]>;
}
