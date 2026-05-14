"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RmmSyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RmmSyncService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../../database/prisma.service");
const rmm_provider_factory_service_1 = require("./rmm-provider-factory.service");
let RmmSyncService = RmmSyncService_1 = class RmmSyncService {
    constructor(prisma, providerFactory, schedulerRegistry) {
        this.prisma = prisma;
        this.providerFactory = providerFactory;
        this.schedulerRegistry = schedulerRegistry;
        this.logger = new common_1.Logger(RmmSyncService_1.name);
    }
    async onModuleInit() {
        try {
            await this.registerDynamicSyncJobs();
        }
        catch (err) {
            this.logger.error('Failed to register dynamic sync jobs, continuing without them');
            this.logger.error(err instanceof Error ? err.message : String(err));
        }
    }
    async registerDynamicSyncJobs() {
        const configs = await this.prisma.rmmProviderConfig.findMany({
            where: { isActive: true },
        });
        for (const config of configs) {
            const jobName = `rmm-sync-${config.companyId}-${config.provider}`;
            const intervalMs = (config.syncIntervalMin || 60) * 60 * 1000;
            if (this.schedulerRegistry.doesExist('interval', jobName)) {
                this.schedulerRegistry.deleteInterval(jobName);
            }
            const interval = setInterval(async () => {
                try {
                    await this.syncProviderAssets(config);
                }
                catch (err) {
                    this.logger.error(`Dynamic sync failed for ${config.provider}/${config.companyId}: ${err.message}`);
                }
            }, intervalMs);
            this.schedulerRegistry.addInterval(jobName, interval);
            this.logger.log(`Registered dynamic sync for ${config.provider}/${config.companyId} every ${config.syncIntervalMin}min`);
        }
    }
    async syncProviderAssets(config) {
        const provider = this.providerFactory.getProvider(config.provider);
        const credentials = JSON.parse(config.credentials);
        const valid = await provider.validateCredentials(credentials);
        if (!valid) {
            this.logger.warn(`Invalid credentials for provider ${config.provider} (company ${config.companyId})`);
            return;
        }
        const assets = await provider.syncAllAssets(credentials);
        for (const asset of assets) {
            const name = asset.name || 'Unknown Asset';
            const assetType = asset.assetType || 'OTHER';
            const serialNumber = asset.serialNumber || undefined;
            const manufacturer = asset.manufacturer || undefined;
            const model = asset.model || undefined;
            const os = asset.os || undefined;
            const ipAddress = asset.ipAddress || undefined;
            const location = asset.location || undefined;
            const status = asset.status || 'ACTIVE';
            if (serialNumber) {
                const existing = await this.prisma.asset.findFirst({ where: { serialNumber, companyId: config.companyId, deletedAt: null } });
                if (existing) {
                    await this.prisma.asset.update({ where: { id: existing.id }, data: { name, assetType, manufacturer, model, os, ipAddress, location, status } });
                }
                else {
                    await this.prisma.asset.create({ data: { name, assetType, serialNumber, manufacturer, model, os, ipAddress, location, status, companyId: config.companyId } });
                }
            }
            else {
                await this.prisma.asset.create({ data: { name, assetType, serialNumber, manufacturer, model, os, ipAddress, location, status, companyId: config.companyId } });
            }
        }
        await this.prisma.rmmProviderConfig.update({
            where: { id: config.id },
            data: { lastSyncAt: new Date() },
        });
        this.logger.log(`Synced ${assets.length} assets from ${config.provider} for company ${config.companyId}`);
    }
    async refreshSyncSchedule(companyId, provider) {
        const jobName = `rmm-sync-${companyId}-${provider}`;
        if (this.schedulerRegistry.doesExist('interval', jobName)) {
            this.schedulerRegistry.deleteInterval(jobName);
        }
        const config = await this.prisma.rmmProviderConfig.findUnique({
            where: { companyId_provider: { companyId, provider } },
        });
        if (config && config.isActive) {
            const intervalMs = (config.syncIntervalMin || 60) * 60 * 1000;
            const interval = setInterval(async () => {
                try {
                    await this.syncProviderAssets(config);
                }
                catch (err) {
                    this.logger.error(`Dynamic sync failed for ${provider}/${companyId}: ${err.message}`);
                }
            }, intervalMs);
            this.schedulerRegistry.addInterval(jobName, interval);
            this.logger.log(`Rescheduled sync for ${provider}/${companyId} every ${config.syncIntervalMin}min`);
        }
    }
    async syncProviderNow(companyId, provider) {
        this.logger.log(`syncProviderNow called: companyId=${companyId} provider=${provider}`);
        const config = await this.prisma.rmmProviderConfig.findUnique({
            where: { companyId_provider: { companyId, provider } },
        });
        if (!config) {
            return { synced: false, error: `No RMM configuration found for ${provider} in this company` };
        }
        await this.syncProviderAssets(config);
        return { synced: true, provider, companyId };
    }
};
exports.RmmSyncService = RmmSyncService;
exports.RmmSyncService = RmmSyncService = RmmSyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        rmm_provider_factory_service_1.RmmProviderFactory,
        schedule_1.SchedulerRegistry])
], RmmSyncService);
//# sourceMappingURL=rmm-sync.service.js.map