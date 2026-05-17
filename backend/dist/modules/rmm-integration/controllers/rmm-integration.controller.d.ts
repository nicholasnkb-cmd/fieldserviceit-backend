import { RmmIntegrationService } from '../services/rmm-integration.service';
import { RmmSyncService } from '../services/rmm-sync.service';
import { RmmProviderFactory } from '../services/rmm-provider-factory.service';
import { PrismaService } from '../../../database/prisma.service';
export declare class RmmIntegrationController {
    private rmmIntegration;
    private rmmSync;
    private providerFactory;
    private prisma;
    constructor(rmmIntegration: RmmIntegrationService, rmmSync: RmmSyncService, providerFactory: RmmProviderFactory, prisma: PrismaService);
    listProviders(): {
        providers: string[];
    };
    syncAsset(body: {
        provider: string;
        assetData: any;
    }, user: any): Promise<import("mysql2").RowDataPacket>;
    createFromAlert(body: {
        provider: string;
        alert: any;
    }, user: any): Promise<any>;
    listConfigs(user: any): Promise<import("mysql2").RowDataPacket[]>;
    saveConfig(body: {
        provider: string;
        credentials: any;
        syncIntervalMin?: number;
    }, user: any): Promise<import("mysql2").RowDataPacket>;
    removeConfig(provider: string, user: any): Promise<import("mysql2").RowDataPacket>;
    syncNow(provider: string, user: any): Promise<{
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
