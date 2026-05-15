import { PrismaService } from '../../../database/prisma.service';
export declare class WorkflowService {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: {
        name: string;
        description?: string;
        triggerOn?: string;
        steps: any[];
    }, companyId: string): Promise<import("mysql2").RowDataPacket>;
    findAll(companyId: string): Promise<import("mysql2").RowDataPacket[]>;
    findOne(id: string, companyId: string): Promise<import("mysql2").RowDataPacket>;
    execute(workflowId: string, ticketId: string, companyId: string): Promise<import("mysql2").RowDataPacket>;
    getRuns(workflowId: string, companyId: string): Promise<import("mysql2").RowDataPacket[]>;
}
