import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { BusinessOnlyGuard } from './common/guards/business-only.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { CmdbModule } from './modules/cmdb/cmdb.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FieldServiceModule } from './modules/field-service/field-service.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { RmmIntegrationModule } from './modules/rmm-integration/rmm-integration.module';
import { AdminModule } from './modules/admin/admin.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SearchModule } from './modules/search/search.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'short', ttl: 1000, limit: 3 }, { name: 'medium', ttl: 10000, limit: 20 }, { name: 'long', ttl: 60000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    TicketsModule,
    CmdbModule,
    WorkflowModule,
    NotificationsModule,
    FieldServiceModule,
    ReportingModule,
    RmmIntegrationModule,
    AdminModule,
    SettingsModule,
    SearchModule,
    UploadsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    PermissionsGuard,
  ],
})
export class AppModule {}
