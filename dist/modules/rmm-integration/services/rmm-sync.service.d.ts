import { OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service';
import { RmmProviderFactory } from './rmm-provider-factory.service';
export declare class RmmSyncService implements OnModuleInit {
    private prisma;
    private providerFactory;
    private schedulerRegistry;
    private readonly logger;
    constructor(prisma: PrismaService, providerFactory: RmmProviderFactory, schedulerRegistry: SchedulerRegistry);
    onModuleInit(): Promise<void>;
    private registerDynamicSyncJobs;
    private syncProviderAssets;
    refreshSyncSchedule(companyId: string, provider: string): Promise<void>;
    syncProviderNow(companyId: string, provider: string): Promise<{
        synced: boolean;
        error: string;
        provider?: undefined;
        companyId?: undefined;
    } | {
        synced: boolean;
        provider: string;
        companyId: string;
        error?: undefined;
    }>;
}
