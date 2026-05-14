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
    }, user: any): Promise<{
        createdAt: Date;
        name: string;
        id: string;
        companyId: string;
        updatedAt: Date;
        deletedAt: Date | null;
        location: string | null;
        status: string;
        ipAddress: string | null;
        assetType: string;
        serialNumber: string | null;
        manufacturer: string | null;
        model: string | null;
        macAddress: string | null;
        os: string | null;
        cpu: string | null;
        ram: string | null;
        storage: string | null;
        notes: string | null;
    }>;
    createFromAlert(body: {
        provider: string;
        alert: any;
    }, user: any): Promise<{
        createdBy: {
            id: string;
            firstName: string;
            lastName: string;
        };
    } & {
        createdAt: Date;
        id: string;
        description: string | null;
        companyId: string | null;
        updatedAt: Date;
        priority: string;
        deletedAt: Date | null;
        ticketNumber: string;
        title: string;
        contactName: string | null;
        contactEmail: string | null;
        contactPhone: string | null;
        category: string | null;
        subcategory: string | null;
        location: string | null;
        latitude: number | null;
        longitude: number | null;
        status: string;
        type: string;
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
    }>;
    listConfigs(user: any): import(".prisma/client").Prisma.PrismaPromise<{
        createdAt: Date;
        id: string;
        companyId: string;
        updatedAt: Date;
        credentials: string;
        isActive: boolean;
        provider: string;
        syncIntervalMin: number;
        lastSyncAt: Date | null;
    }[]>;
    saveConfig(body: {
        provider: string;
        credentials: any;
        syncIntervalMin?: number;
    }, user: any): Promise<{
        createdAt: Date;
        id: string;
        companyId: string;
        updatedAt: Date;
        credentials: string;
        isActive: boolean;
        provider: string;
        syncIntervalMin: number;
        lastSyncAt: Date | null;
    }>;
    removeConfig(provider: string, user: any): Promise<{
        createdAt: Date;
        id: string;
        companyId: string;
        updatedAt: Date;
        credentials: string;
        isActive: boolean;
        provider: string;
        syncIntervalMin: number;
        lastSyncAt: Date | null;
    }>;
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
