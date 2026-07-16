import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { QueryMetricsContext } from '../observability/query-metrics.context';
import { StructuredLogger } from '../logger/structured-logger.service';

@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestMetricsInterceptor.name);
  private readonly queryWarningThreshold = Number(process.env.DB_QUERY_COUNT_WARN || 25);

  constructor(
    private readonly queryMetrics: QueryMetricsContext,
    private readonly structuredLogger: StructuredLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startedAt = Date.now();

    return new Observable((subscriber) => this.queryMetrics.run(() => {
      const subscription = next.handle().pipe(finalize(() => {
        const metrics = this.queryMetrics.current();
        if (!metrics) return;
        const durationMs = Date.now() - startedAt;
        this.structuredLogger.trackRequest(durationMs, response.statusCode);
        response.setHeader?.('Server-Timing', `app;dur=${durationMs}, db;dur=${metrics.durationMs}`);
        const payload = JSON.stringify({
          event: 'request_performance',
          method: request.method,
          path: request.route?.path || request.path,
          statusCode: response.statusCode,
          durationMs,
          queryCount: metrics.count,
          databaseDurationMs: metrics.durationMs,
          slowestQueryMs: metrics.slowestMs,
          correlationId: request.correlationId,
          userId: request.user?.id,
          companyId: request.user?.companyId,
        });
        if (metrics.count >= this.queryWarningThreshold) this.logger.warn(payload);
        else this.logger.log(payload);
      })).subscribe(subscriber);
      return () => subscription.unsubscribe();
    }));
  }
}
