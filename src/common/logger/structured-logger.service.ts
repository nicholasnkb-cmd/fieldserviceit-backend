import { Injectable, Logger as NestLogger } from '@nestjs/common';
import { Request } from 'express';

/**
 * Structured Logger Service
 * 
 * Provides structured logging with correlation IDs for request tracing.
 * Tracks request volume, error rates, and performance metrics.
 * 
 * Features:
 * - JSON formatted logs for easy parsing
 * - Includes correlation ID in all logs
 * - Tracks request/response context
 * - Monitors request volume and error rates
 * - Captures performance metrics (latency, database queries)
 * - Supports log levels: error, warn, info, debug
 * 
 * Usage:
 * ```typescript
 * this.logger.info('User logged in', { userId: user.id, request });
 * this.logger.error('Database error', error, { request });
 * this.logger.trackPerformance('asset.findMany', 145, 'query');
 * ```
 * 
 * Output example:
 * ```json
 * {
 *   "timestamp": "2026-06-10T12:00:00.000Z",
 *   "level": "error",
 *   "correlationId": "550e8400-e29b-41d4-a716-446655440000",
 *   "message": "Database error",
 *   "service": "UserService",
 *   "method": "createUser",
 *   "error": "UNIQUE constraint failed",
 *   "userId": "user-123",
 *   "statusCode": 500
 * }
 * ```
 */
@Injectable()
export class StructuredLogger {
  private logger = new NestLogger();
  
  // Metrics tracking
  private requestCount = 0;
  private errorCount = 0;
  private slowQueryCount = 0;
  private totalRequestLatency = 0;
  private performanceMetrics: Map<string, { count: number; totalTime: number; slowCount: number }> = new Map();
  private readonly METRICS_INTERVAL = 300000; // Report every 5 minutes
  private readonly SLOW_QUERY_THRESHOLD = 1000; // 1 second

  constructor() {
    // Report metrics every 5 minutes
    const interval = setInterval(() => this.reportMetrics(), this.METRICS_INTERVAL);
    interval.unref();
  }

  /**
   * Extract correlation ID from request
   */
  private getCorrelationId(request?: Request | any): string {
    if (!request) return 'no-correlation-id';
    return (request as any).correlationId || request.headers?.['x-correlation-id'] || 'no-correlation-id';
  }

  /**
   * Build structured log object
   */
  private buildLog(
    message: string,
    level: string,
    context: string,
    request?: Request | any,
    metadata?: Record<string, any>,
    error?: any,
  ) {
    const correlationId = this.getCorrelationId(request);
    const log: any = {
      timestamp: new Date().toISOString(),
      level,
      correlationId,
      message,
      service: context,
    };

    // Add request context
    if (request) {
      log.method = request.method;
      log.path = request.path || request.url;
      log.ip = request.ip || request.headers?.['x-forwarded-for'];
      log.userId = (request as any).user?.id;
      log.companyId = (request as any).user?.companyId;
    }

    // Add metadata
    if (metadata) {
      Object.assign(log, metadata);
    }

    // Add error details
    if (error) {
      log.error = {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
      };
      if (process.env.NODE_ENV === 'development') {
        log.error.stack = error.stack;
      }
    }

    return log;
  }

  /**
   * Log error level
   */
  error(
    message: string,
    context: string,
    request?: Request | any,
    error?: Error,
    metadata?: Record<string, any>,
  ) {
    this.errorCount++;
    const log = this.buildLog(message, 'error', context, request, metadata, error);
    console.error(JSON.stringify(log));
    this.logger.error(message, { ...log, stack: error?.stack });
  }

  /**
   * Log warning level
   */
  warn(
    message: string,
    context: string,
    request?: Request | any,
    metadata?: Record<string, any>,
  ) {
    const log = this.buildLog(message, 'warn', context, request, metadata);
    console.warn(JSON.stringify(log));
  }

  /**
   * Log info level
   */
  info(
    message: string,
    context: string,
    request?: Request | any,
    metadata?: Record<string, any>,
  ) {
    const log = this.buildLog(message, 'info', context, request, metadata);
    console.log(JSON.stringify(log));
  }

  trackRequest(latencyMs: number, statusCode: number) {
    this.requestCount++;
    this.totalRequestLatency += latencyMs;
    if (statusCode >= 500) this.errorCount++;
    this.trackPerformance('http.request', latencyMs, 'api');
    if (this.requestCount % 100 === 0) this.reportMetrics();
  }

  /**
   * Log debug level (only in development)
   */
  debug(
    message: string,
    context: string,
    request?: Request | any,
    metadata?: Record<string, any>,
  ) {
    if (process.env.NODE_ENV !== 'development') return;
    const log = this.buildLog(message, 'debug', context, request, metadata);
    console.debug(JSON.stringify(log));
  }

  /**
   * Track performance metrics for database queries and other operations
   * 
   * @param operation - Name of the operation (e.g., 'asset.findMany', 'database.query')
   * @param latencyMs - Time taken in milliseconds
   * @param type - Type of operation ('query', 'api', 'cache', etc.)
   */
  trackPerformance(operation: string, latencyMs: number, type: string = 'operation') {
    // Track slow queries
    if (latencyMs > this.SLOW_QUERY_THRESHOLD) {
      this.slowQueryCount++;
      if (type === 'query') {
        this.warn(
          `Slow ${type} detected`,
          'PerformanceMonitor',
          undefined,
          {
            operation,
            latencyMs,
            type,
            threshold: this.SLOW_QUERY_THRESHOLD,
          }
        );
      }
    }

    // Track per-operation metrics
    if (!this.performanceMetrics.has(operation)) {
      this.performanceMetrics.set(operation, { count: 0, totalTime: 0, slowCount: 0 });
    }

    const metrics = this.performanceMetrics.get(operation)!;
    metrics.count++;
    metrics.totalTime += latencyMs;
    if (latencyMs > this.SLOW_QUERY_THRESHOLD) {
      metrics.slowCount++;
    }
  }

  /**
   * Get current metrics for monitoring
   */
  getMetrics() {
    const avgLatency = this.requestCount > 0 ? (this.totalRequestLatency / this.requestCount).toFixed(2) : '0';
    const errorRate = this.requestCount > 0 ? ((this.errorCount / this.requestCount) * 100).toFixed(2) : '0';

    const operationMetrics: any = {};
    this.performanceMetrics.forEach((value, key) => {
      operationMetrics[key] = {
        count: value.count,
        avgLatency: (value.totalTime / value.count).toFixed(2),
        slowCount: value.slowCount,
        slowPercentage: ((value.slowCount / value.count) * 100).toFixed(2),
      };
    });

    return {
      timestamp: new Date().toISOString(),
      requests: {
        total: this.requestCount,
        errors: this.errorCount,
        errorRate: errorRate + '%',
        averageLatency: avgLatency + 'ms',
      },
      slowQueries: {
        total: this.slowQueryCount,
        threshold: this.SLOW_QUERY_THRESHOLD + 'ms',
      },
      operations: operationMetrics,
    };
  }

  /**
   * Report metrics to console and reset counters
   */
  private reportMetrics() {
    if (this.requestCount === 0) return;

    const metrics = this.getMetrics();
    const { timestamp, ...metricsData } = metrics;
    const metricsLog = {
      timestamp,
      type: 'METRICS_REPORT',
      ...metricsData,
    };

    console.log(JSON.stringify(metricsLog));
  }

  /**
   * Reset all counters (useful for testing)
   */
  resetMetrics() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.slowQueryCount = 0;
    this.totalRequestLatency = 0;
    this.performanceMetrics.clear();
  }
}
