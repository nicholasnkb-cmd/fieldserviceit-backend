import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
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
import { DatabaseThrottlerStorage } from './common/services/database-throttler-storage.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DATABASE_URL: Joi.string().required().pattern(/^mysql:\/\//),
        DB_POOL_SIZE: Joi.number().integer().min(1).max(100).default(5),
        DB_POOL_MAX_IDLE: Joi.number().integer().min(1).max(100).default(2),
        DB_POOL_QUEUE_LIMIT: Joi.number().integer().min(1).max(10000).default(100),
        DB_CONNECT_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(10000),
        DB_QUERY_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(30000),
        JWT_SECRET: Joi.string().required().min(32),
        JWT_REFRESH_SECRET: Joi.string().min(32).when('NODE_ENV', {
          is: 'production',
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        CORS_ORIGIN: Joi.string().optional(),
        PORT: Joi.number().port().default(4000),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        TRUST_PROXY_HOPS: Joi.number().integer().min(1).max(5).default(1),
        SMTP_HOST: Joi.string().optional(),
        SMTP_PORT: Joi.number().port().optional(),
        SMTP_USER: Joi.string().optional(),
        SMTP_PASS: Joi.string().optional(),
        SMTP_FROM: Joi.string().optional(),
        SMTP_REPLY_TO: Joi.string().optional(),
        INBOUND_EMAIL_API_KEY: Joi.string().allow('').optional(),
        EMAIL_WEBHOOK_API_KEY: Joi.string().allow('').optional(),
        BILLING_PROVIDER: Joi.string().valid('PAYPAL').default('PAYPAL'),
        PAYPAL_CLIENT_ID: Joi.string().optional(),
        PAYPAL_CLIENT_SECRET: Joi.string().optional(),
        PAYPAL_WEBHOOK_ID: Joi.string().optional(),
        PAYPAL_ENVIRONMENT: Joi.string().valid('sandbox', 'production').default('sandbox'),
        PAYPAL_SUBSCRIPTION_MANAGE_URL: Joi.string().uri().optional(),
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
        CREDENTIAL_ENCRYPTION_KEY: Joi.string().min(32).invalid(Joi.ref('JWT_SECRET')).when('NODE_ENV', {
          is: 'production',
          then: Joi.required(),
          otherwise: Joi.optional(),
        }).messages({
          'any.invalid': 'CREDENTIAL_ENCRYPTION_KEY must be different from JWT_SECRET',
        }),
        CREDENTIAL_ENCRYPTION_KEY_PREVIOUS: Joi.string().optional(),
        BACKUP_DIR: Joi.string().optional(),
        BACKUP_S3_ENDPOINT: Joi.string().uri().when('NODE_ENV', { is: 'production', then: Joi.required(), otherwise: Joi.optional() }),
        BACKUP_S3_REGION: Joi.string().default('us-east-1'),
        BACKUP_S3_BUCKET: Joi.string().min(3).when('NODE_ENV', { is: 'production', then: Joi.required(), otherwise: Joi.optional() }),
        BACKUP_S3_ACCESS_KEY_ID: Joi.string().when('NODE_ENV', { is: 'production', then: Joi.required(), otherwise: Joi.optional() }),
        BACKUP_S3_SECRET_ACCESS_KEY: Joi.string().when('NODE_ENV', { is: 'production', then: Joi.required(), otherwise: Joi.optional() }),
        CLAMAV_HOST: Joi.string().hostname().when('NODE_ENV', {
          is: 'production',
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        CLAMAV_PORT: Joi.number().port().optional().default(3310),
        CLAMAV_REQUIRED: Joi.boolean().when('NODE_ENV', {
          is: 'production',
          then: Joi.valid(true).required(),
          otherwise: Joi.optional().default(false),
        }),
        OIDC_ALLOW_PRIVATE_ISSUERS: Joi.boolean().optional().default(false),
        MONITORING_API_KEY: Joi.string().min(24).optional(),
        SENTRY_DSN: Joi.string().uri().optional(),
        SENTRY_ENABLED: Joi.boolean().optional().default(true),
        SENTRY_TRACES_SAMPLE_RATE: Joi.number().min(0).max(1).optional().default(0.05),
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
    { provide: ThrottlerStorage, useClass: DatabaseThrottlerStorage },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    PermissionsGuard,
    StepUpGuard,
  ],
})
export class AppModule {}
