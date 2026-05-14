"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const database_module_1 = require("./database/database.module");
const permissions_guard_1 = require("./common/guards/permissions.guard");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const companies_module_1 = require("./modules/companies/companies.module");
const tickets_module_1 = require("./modules/tickets/tickets.module");
const cmdb_module_1 = require("./modules/cmdb/cmdb.module");
const workflow_module_1 = require("./modules/workflow/workflow.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const field_service_module_1 = require("./modules/field-service/field-service.module");
const reporting_module_1 = require("./modules/reporting/reporting.module");
const rmm_integration_module_1 = require("./modules/rmm-integration/rmm-integration.module");
const admin_module_1 = require("./modules/admin/admin.module");
const settings_module_1 = require("./modules/settings/settings.module");
const search_module_1 = require("./modules/search/search.module");
const uploads_module_1 = require("./modules/uploads/uploads.module");
const health_module_1 = require("./modules/health/health.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRoot([{ name: 'short', ttl: 1000, limit: 3 }, { name: 'medium', ttl: 10000, limit: 20 }, { name: 'long', ttl: 60000, limit: 100 }]),
            database_module_1.DatabaseModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            companies_module_1.CompaniesModule,
            tickets_module_1.TicketsModule,
            cmdb_module_1.CmdbModule,
            workflow_module_1.WorkflowModule,
            notifications_module_1.NotificationsModule,
            field_service_module_1.FieldServiceModule,
            reporting_module_1.ReportingModule,
            rmm_integration_module_1.RmmIntegrationModule,
            admin_module_1.AdminModule,
            settings_module_1.SettingsModule,
            search_module_1.SearchModule,
            uploads_module_1.UploadsModule,
            health_module_1.HealthModule,
        ],
        providers: [
            { provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard },
            permissions_guard_1.PermissionsGuard,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map