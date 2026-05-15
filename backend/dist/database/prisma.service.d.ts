import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseService } from './database.service';
export declare class PrismaService extends DatabaseService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
