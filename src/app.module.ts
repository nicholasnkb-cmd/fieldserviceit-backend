import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import * as Joi from 'joi';
import { DatabaseModule } from './database/database.module';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { StepUpGuard } from './common/guards/step-up.guard';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
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
import { BillingModule } from './modules/billing/billing.module';
import { LoggerModule } from './common/logger/logger.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { ErrorReportsModule } from './modules/error-reports/error-reports.module';
import { OperationsModule } from './modules/operations/operations.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { QuotesInvoicesModule } from './modules/quotes-invoices/quotes-invoices.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CustomerPortalModule } from './modules/customer-portal/customer-portal.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { SecurityCenterModule } from './modules/security-center/security-center.module';
import { TopologyModule } from './modules/topology/topology.module';
import { CatalogRequestsModule } from './modules/catalog-requests/catalog-requests.module';
import { PlatformSecurityModule } from './modules/platform-security/platform-security.module';
import { EndpointOperationsModule } from './modules/endpoint-operations/endpoint-operations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required().pattern(/^mysql:\/\//),
        JWT_SECRET: Joi.string().required().min(16),
        JWT_REFRESH_SECRET: Joi.string().optional(),
        CORS_ORIGIN: Joi.string().optional(),
        PORT: Joi.number().port().default(4000),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        SMTP_HOST: Joi.string().optional(),
        SMTP_PORT: Joi.number().port().optional(),
        SMTP_USER: Joi.string().optional(),
        SMTP_PASS: Joi.string().optional(),
        SMTP_FROM: Joi.string().optional(),
        SMTP_REPLY_TO: Joi.string().optional(),
        INBOUND_EMAIL_API_KEY: Joi.string().optional(),
        EMAIL_WEBHOOK_API_KEY: Joi.string().optional(),
        STRIPE_SECRET_KEY: Joi.string().optional(),
        STRIPE_WEBHOOK_SECRET: Joi.string().optional(),
        UPLOAD_DIR: Joi.string().optional(),
        SWAGGER_ENABLED: Joi.boolean().optional().default(false),
        THROTTLE_TTL_SHORT: Joi.number().default(1000),
        THROTTLE_LIMIT_SHORT: Joi.number().default(10),
        THROTTLE_TTL_MEDIUM: Joi.number().default(10000),
        THROTTLE_LIMIT_MEDIUM: Joi.number().default(120),
        THROTTLE_TTL_LONG: Joi.number().default(60000),
        THROTTLE_LIMIT_LONG: Joi.number().default(600),
        NETWORK_SYSLOG_ENABLED: Joi.boolean().optional().default(true),
        NETWORK_SYSLOG_PORT: Joi.number().port().optional().default(5514),
        CREDENTIAL_ENCRYPTION_KEY: Joi.string().optional(),
        BACKUP_DIR: Joi.string().optional(),
        CLAMAV_HOST: Joi.string().optional(),
        CLAMAV_PORT: Joi.number().port().optional().default(3310),
        CLAMAV_REQUIRED: Joi.boolean().optional().default(false),
        OIDC_ALLOW_PRIVATE_ISSUERS: Joi.boolean().optional().default(false),
        MONITORING_API_KEY: Joi.string().min(24).optional(),
      }),
      validationOptions: { abortEarly: false, allowUnknown: true },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'short', ttl: config.get('THROTTLE_TTL_SHORT', 1000), limit: config.get('THROTTLE_LIMIT_SHORT', 10) },
        { name: 'medium', ttl: config.get('THROTTLE_TTL_MEDIUM', 10000), limit: config.get('THROTTLE_LIMIT_MEDIUM', 120) },
        { name: 'long', ttl: config.get('THROTTLE_TTL_LONG', 60000), limit: config.get('THROTTLE_LIMIT_LONG', 600) },
      ],
    }),
    ScheduleModule.forRoot(),
    LoggerModule,
    DatabaseModule,
    AuditLogModule,
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
    BillingModule,
    AiAgentModule,
    ErrorReportsModule,
    OperationsModule,
    KnowledgeBaseModule,
    QuotesInvoicesModule,
    InventoryModule,
    CustomerPortalModule,
    MaintenanceModule,
    SecurityCenterModule,
    TopologyModule,
    CatalogRequestsModule,
    PlatformSecurityModule,
    EndpointOperationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    PermissionsGuard,
    StepUpGuard,
  ],
})
export class AppModule {}
