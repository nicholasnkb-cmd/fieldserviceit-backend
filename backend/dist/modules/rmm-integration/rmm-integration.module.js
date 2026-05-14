"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RmmIntegrationModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const rmm_integration_service_1 = require("./services/rmm-integration.service");
const rmm_sync_service_1 = require("./services/rmm-sync.service");
const rmm_integration_controller_1 = require("./controllers/rmm-integration.controller");
const rmm_provider_factory_service_1 = require("./services/rmm-provider-factory.service");
const prisma_service_1 = require("../../database/prisma.service");
const ticket_timeline_service_1 = require("../tickets/services/ticket-timeline.service");
const notifications_module_1 = require("../notifications/notifications.module");
const tickets_module_1 = require("../tickets/tickets.module");
let RmmIntegrationModule = class RmmIntegrationModule {
};
exports.RmmIntegrationModule = RmmIntegrationModule;
exports.RmmIntegrationModule = RmmIntegrationModule = __decorate([
    (0, common_1.Module)({
        imports: [schedule_1.ScheduleModule.forRoot(), notifications_module_1.NotificationsModule, tickets_module_1.TicketsModule],
        controllers: [rmm_integration_controller_1.RmmIntegrationController],
        providers: [
            rmm_integration_service_1.RmmIntegrationService,
            rmm_sync_service_1.RmmSyncService,
            rmm_provider_factory_service_1.RmmProviderFactory,
            prisma_service_1.PrismaService,
            ticket_timeline_service_1.TicketTimelineService,
        ],
        exports: [rmm_integration_service_1.RmmIntegrationService, rmm_sync_service_1.RmmSyncService, rmm_provider_factory_service_1.RmmProviderFactory],
    })
], RmmIntegrationModule);
//# sourceMappingURL=rmm-integration.module.js.map