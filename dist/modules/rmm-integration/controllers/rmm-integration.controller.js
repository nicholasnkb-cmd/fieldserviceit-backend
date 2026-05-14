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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RmmIntegrationController = void 0;
const common_1 = require("@nestjs/common");
const rmm_integration_service_1 = require("../services/rmm-integration.service");
const rmm_sync_service_1 = require("../services/rmm-sync.service");
const rmm_provider_factory_service_1 = require("../services/rmm-provider-factory.service");
const jwt_auth_guard_1 = require("../../../common/guards/jwt-auth.guard");
const tenant_guard_1 = require("../../../common/guards/tenant.guard");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const prisma_service_1 = require("../../../database/prisma.service");
let RmmIntegrationController = class RmmIntegrationController {
    constructor(rmmIntegration, rmmSync, providerFactory, prisma) {
        this.rmmIntegration = rmmIntegration;
        this.rmmSync = rmmSync;
        this.providerFactory = providerFactory;
        this.prisma = prisma;
    }
    listProviders() {
        return { providers: this.providerFactory.listProviders() };
    }
    syncAsset(body, user) {
        return this.rmmIntegration.syncAsset(body.provider, body.assetData, user.companyId);
    }
    createFromAlert(body, user) {
        return this.rmmIntegration.createTicketFromAlert(body.provider, body.alert, user.companyId);
    }
    listConfigs(user) {
        return this.prisma.rmmProviderConfig.findMany({ where: { companyId: user.companyId } });
    }
    async saveConfig(body, user) {
        const config = await this.prisma.rmmProviderConfig.upsert({
            where: { companyId_provider: { companyId: user.companyId, provider: body.provider } },
            update: { credentials: JSON.stringify(body.credentials), syncIntervalMin: body.syncIntervalMin ?? 60, isActive: true },
            create: { companyId: user.companyId, provider: body.provider, credentials: JSON.stringify(body.credentials), syncIntervalMin: body.syncIntervalMin ?? 60 },
        });
        await this.rmmSync.refreshSyncSchedule(user.companyId, body.provider);
        return config;
    }
    async removeConfig(provider, user) {
        const config = await this.prisma.rmmProviderConfig.update({
            where: { companyId_provider: { companyId: user.companyId, provider } },
            data: { isActive: false },
        });
        await this.rmmSync.refreshSyncSchedule(user.companyId, provider);
        return config;
    }
    syncNow(provider, user) {
        return this.rmmSync.syncProviderNow(user.companyId, provider);
    }
};
exports.RmmIntegrationController = RmmIntegrationController;
__decorate([
    (0, common_1.Get)('providers'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RmmIntegrationController.prototype, "listProviders", null);
__decorate([
    (0, common_1.Post)('sync-asset'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RmmIntegrationController.prototype, "syncAsset", null);
__decorate([
    (0, common_1.Post)('alert'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RmmIntegrationController.prototype, "createFromAlert", null);
__decorate([
    (0, common_1.Get)('configs'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RmmIntegrationController.prototype, "listConfigs", null);
__decorate([
    (0, common_1.Post)('configs'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RmmIntegrationController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Delete)('configs/:provider'),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RmmIntegrationController.prototype, "removeConfig", null);
__decorate([
    (0, common_1.Post)('sync-now/:provider'),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RmmIntegrationController.prototype, "syncNow", null);
exports.RmmIntegrationController = RmmIntegrationController = __decorate([
    (0, common_1.Controller)('integrations/rmm'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, tenant_guard_1.TenantGuard),
    __metadata("design:paramtypes", [rmm_integration_service_1.RmmIntegrationService,
        rmm_sync_service_1.RmmSyncService,
        rmm_provider_factory_service_1.RmmProviderFactory,
        prisma_service_1.PrismaService])
], RmmIntegrationController);
//# sourceMappingURL=rmm-integration.controller.js.map