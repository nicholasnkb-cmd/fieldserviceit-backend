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
    }, user: any): Promise<import("@prisma/client/runtime").GetResult<{
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
    }, unknown> & {}>;
    createFromAlert(body: {
        provider: string;
        alert: any;
    }, user: any): Promise<{
        createdBy: {
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
    listConfigs(user: any): import(".prisma/client").Prisma.PrismaPromise<(import("@prisma/client/runtime").GetResult<{
        id: string;
        companyId: string;
        provider: string;
        credentials: string;
        isActive: boolean;
        syncIntervalMin: number;
        lastSyncAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {})[]>;
    saveConfig(body: {
        provider: string;
        credentials: any;
        syncIntervalMin?: number;
    }, user: any): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        companyId: string;
        provider: string;
        credentials: string;
        isActive: boolean;
        syncIntervalMin: number;
        lastSyncAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {}>;
    removeConfig(provider: string, user: any): Promise<import("@prisma/client/runtime").GetResult<{
        id: string;
        companyId: string;
        provider: string;
        credentials: string;
        isActive: boolean;
        syncIntervalMin: number;
        lastSyncAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }, unknown> & {}>;
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
