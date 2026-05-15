import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
export declare class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private pool;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private parseDatabaseUrl;
    query<T = RowDataPacket[]>(sql: string, values?: any[]): Promise<T>;
    execute(sql: string, values?: any[]): Promise<ResultSetHeader>;
    transaction<T>(fn: (tx: TransactionClient) => Promise<T>): Promise<T>;
    user: {
        findUnique: ({ where, select }: {
            where: Record<string, any>;
            select?: Record<string, boolean>;
        }) => Promise<RowDataPacket>;
        findFirst: ({ where, select, include }: {
            where: Record<string, any>;
            select?: Record<string, boolean>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket>;
        findMany: ({ where, select, orderBy, skip, take, include }: {
            where?: Record<string, any>;
            select?: Record<string, boolean>;
            orderBy?: Record<string, "asc" | "desc">;
            skip?: number;
            take?: number;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket[]>;
        count: ({ where }: {
            where?: Record<string, any>;
        }) => Promise<number>;
        create: ({ data, select }: {
            data: Record<string, any>;
            select?: Record<string, boolean>;
        }) => Promise<RowDataPacket>;
        update: ({ where, data, select }: {
            where: Record<string, any>;
            data: Record<string, any>;
            select?: Record<string, boolean>;
        }) => Promise<RowDataPacket>;
        updateMany: ({ where, data }: {
            where: Record<string, any>;
            data: Record<string, any>;
        }) => Promise<{
            count: number;
        }>;
        deleteMany: ({ where }: {
            where: Record<string, any>;
        }) => Promise<{
            count: number;
        }>;
    };
    company: {
        findUnique: ({ where, select }: {
            where: Record<string, any>;
            select?: Record<string, boolean>;
        }) => Promise<RowDataPacket>;
        findFirst: ({ where, select }: {
            where: Record<string, any>;
            select?: Record<string, boolean>;
        }) => Promise<RowDataPacket>;
        findMany: ({ where, select, orderBy, skip, take }: {
            where?: Record<string, any>;
            select?: Record<string, boolean>;
            orderBy?: Record<string, "asc" | "desc">;
            skip?: number;
            take?: number;
        }) => Promise<RowDataPacket[]>;
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        update: ({ where, data, select }: {
            where: Record<string, any>;
            data: Record<string, any>;
            select?: Record<string, boolean>;
        }) => Promise<RowDataPacket>;
    };
    ticket: {
        findUnique: ({ where, select, include }: {
            where: Record<string, any>;
            select?: Record<string, boolean>;
            include?: Record<string, any>;
        }) => Promise<any>;
        findFirst: ({ where, select, include }: {
            where: Record<string, any>;
            select?: Record<string, boolean>;
            include?: Record<string, any>;
        }) => Promise<any>;
        findMany: ({ where, select, orderBy, skip, take, include }: {
            where?: Record<string, any>;
            select?: Record<string, boolean>;
            orderBy?: Record<string, "asc" | "desc">;
            skip?: number;
            take?: number;
            include?: Record<string, any>;
        }) => Promise<any[]>;
        count: ({ where }: {
            where?: Record<string, any>;
        }) => Promise<number>;
        create: ({ data, select, include }: {
            data: Record<string, any>;
            select?: Record<string, boolean>;
            include?: Record<string, any>;
        }) => Promise<any>;
        update: ({ where, data, select, include }: {
            where: Record<string, any>;
            data: Record<string, any>;
            select?: Record<string, boolean>;
            include?: Record<string, any>;
        }) => Promise<any>;
        delete: ({ where }: {
            where: Record<string, any>;
        }) => Promise<{
            count: number;
        }>;
    };
    session: {
        findUnique: ({ where, include }: {
            where: Record<string, any>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket>;
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        update: ({ where, data }: {
            where: Record<string, any>;
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        deleteMany: ({ where }: {
            where: Record<string, any>;
        }) => Promise<{
            count: number;
        }>;
    };
    ticketAttachment: {
        create: ({ data, include }: {
            data: Record<string, any>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket>;
        delete: ({ where }: {
            where: Record<string, any>;
        }) => Promise<{
            success: boolean;
        }>;
    };
    ticketTemplate: {
        findMany: ({ where, orderBy }: {
            where?: Record<string, any>;
            orderBy?: Record<string, "asc" | "desc">;
        }) => Promise<RowDataPacket[]>;
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        update: ({ where, data }: {
            where: Record<string, any>;
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
    };
    timeEntry: {
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        findMany: ({ where, orderBy, include }: {
            where?: Record<string, any>;
            orderBy?: Record<string, "asc" | "desc">;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket[]>;
    };
    dispatch: {
        findMany: ({ where, select, orderBy, skip, take }: {
            where?: Record<string, any>;
            select?: Record<string, boolean>;
            orderBy?: Record<string, "asc" | "desc">;
            skip?: number;
            take?: number;
        }) => Promise<RowDataPacket[]>;
    };
    asset: {
        findMany: ({ where, select, orderBy, skip, take }: {
            where?: Record<string, any>;
            select?: Record<string, boolean>;
            orderBy?: Record<string, "asc" | "desc">;
            skip?: number;
            take?: number;
        }) => Promise<RowDataPacket[]>;
        findFirst: ({ where, select }: {
            where: Record<string, any>;
            select?: Record<string, boolean>;
        }) => Promise<RowDataPacket>;
        findUnique: ({ where, select, orderBy }: {
            where: Record<string, any>;
            select?: Record<string, boolean>;
            orderBy?: Record<string, "asc" | "desc">;
        }) => Promise<RowDataPacket>;
        count: ({ where }: {
            where?: Record<string, any>;
        }) => Promise<number>;
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        update: ({ where, data }: {
            where: Record<string, any>;
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
    };
    sla: {
        findMany: ({ where }: {
            where?: Record<string, any>;
        }) => Promise<RowDataPacket[]>;
        findUnique: ({ where }: {
            where: Record<string, any>;
        }) => Promise<RowDataPacket>;
    };
    notification: {
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        findMany: ({ where, orderBy, skip, take }: {
            where?: Record<string, any>;
            orderBy?: Record<string, "asc" | "desc">;
            skip?: number;
            take?: number;
        }) => Promise<RowDataPacket[]>;
        count: ({ where }: {
            where?: Record<string, any>;
        }) => Promise<number>;
    };
    role: {
        findMany: ({ where, include }: {
            where?: Record<string, any>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket[]>;
        findUnique: ({ where, include }: {
            where: Record<string, any>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket>;
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        update: ({ where, data }: {
            where: Record<string, any>;
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        delete: ({ where }: {
            where: Record<string, any>;
        }) => Promise<{
            success: boolean;
        }>;
    };
    permission: {
        findMany: ({ where }: {
            where?: Record<string, any>;
        }) => Promise<RowDataPacket[]>;
    };
    rolePermission: {
        findMany: ({ where, include }: {
            where?: Record<string, any>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket[]>;
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        deleteMany: ({ where }: {
            where: Record<string, any>;
        }) => Promise<{
            count: number;
        }>;
    };
    userRole: {
        findMany: ({ where, include }: {
            where?: Record<string, any>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket[]>;
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        delete: ({ where }: {
            where: Record<string, any>;
        }) => Promise<{
            success: boolean;
        }>;
    };
    auditLog: {
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<Record<string, any>>;
        findMany: ({ where, orderBy, skip, take }: {
            where?: Record<string, any>;
            orderBy?: Record<string, "asc" | "desc">;
            skip?: number;
            take?: number;
        }) => Promise<RowDataPacket[]>;
        count: ({ where }: {
            where?: Record<string, any>;
        }) => Promise<number>;
    };
    workflow: {
        findMany: ({ where, include, orderBy }: {
            where?: Record<string, any>;
            include?: Record<string, any>;
            orderBy?: Record<string, "asc" | "desc">;
        }) => Promise<RowDataPacket[]>;
        findFirst: ({ where, include }: {
            where: Record<string, any>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket>;
        create: ({ data, include }: {
            data: Record<string, any>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket>;
        update: ({ where, data }: {
            where: Record<string, any>;
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
    };
    workflowRun: {
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        findMany: ({ where, include, orderBy }: {
            where?: Record<string, any>;
            include?: Record<string, any>;
            orderBy?: Record<string, "asc" | "desc">;
        }) => Promise<RowDataPacket[]>;
    };
    rmmProviderConfig: {
        findMany: ({ where }: {
            where?: Record<string, any>;
        }) => Promise<RowDataPacket[]>;
        findFirst: ({ where }: {
            where: Record<string, any>;
        }) => Promise<RowDataPacket>;
        findUnique: ({ where }: {
            where: Record<string, any>;
        }) => Promise<RowDataPacket>;
        create: ({ data }: {
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
        update: ({ where, data }: {
            where: Record<string, any>;
            data: Record<string, any>;
        }) => Promise<RowDataPacket>;
    };
    kbArticle: {
        findMany: ({ where, orderBy, skip, take }: {
            where?: Record<string, any>;
            orderBy?: Record<string, "asc" | "desc">;
            skip?: number;
            take?: number;
        }) => Promise<RowDataPacket[]>;
    };
    ticketTimeline: {
        findMany: ({ where, orderBy, include }: {
            where?: Record<string, any>;
            orderBy?: Record<string, "asc" | "desc">;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket[]>;
        create: ({ data, include }: {
            data: Record<string, any>;
            include?: Record<string, any>;
        }) => Promise<RowDataPacket>;
    };
    private enrichTicket;
    private escapeColumn;
    private generateUuid;
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $queryRaw(strings: TemplateStringsArray, ...values: any[]): Promise<RowDataPacket[]>;
}
declare class TransactionClient {
    private conn;
    constructor(conn: any);
    query<T = RowDataPacket[]>(sql: string, values?: any[]): Promise<T>;
    execute(sql: string, values?: any[]): Promise<ResultSetHeader>;
}
export {};
