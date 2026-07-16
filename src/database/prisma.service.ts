import { Injectable, Optional } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { MigrationsService } from './migrations/migrations.service';
import { StructuredLogger } from '../common/logger/structured-logger.service';
import { QueryMetricsContext } from '../common/observability/query-metrics.context';

@Injectable()
export class PrismaService extends DatabaseService {
  constructor(
    @Optional() migrationsService?: MigrationsService,
    @Optional() structuredLogger?: StructuredLogger,
    @Optional() queryMetrics?: QueryMetricsContext,
  ) {
    super(migrationsService, structuredLogger, queryMetrics);
  }
}
