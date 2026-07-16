import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DatabaseService } from './database.service';
import { MigrationsService } from './migrations/migrations.service';
import { AuthorizationRepository } from './repositories/authorization.repository';
import { SessionRepository } from './repositories/session.repository';
import { AssetRepository } from './repositories/asset.repository';
import { QueryMetricsContext } from '../common/observability/query-metrics.context';

@Global()
@Module({
  providers: [
    DatabaseService,
    { provide: PrismaService, useExisting: DatabaseService },
    MigrationsService,
    AuthorizationRepository,
    SessionRepository,
    AssetRepository,
    QueryMetricsContext,
  ],
  exports: [PrismaService, DatabaseService, MigrationsService, AuthorizationRepository, SessionRepository, AssetRepository, QueryMetricsContext],
})
export class DatabaseModule {}
