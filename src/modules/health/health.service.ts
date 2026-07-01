import { Injectable, ServiceUnavailableException, Logger } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { PrismaService } from '../../database/prisma.service';
import { StructuredLogger } from '../../common/logger/structured-logger.service';

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  commit: string;
  database: {
    status: 'ok' | 'error';
    latency?: number;
  };
}

export interface HealthDashboard {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  commit: string;
  uptime: {
    seconds: number;
    readable: string;
  };
  database: {
    status: 'ok' | 'error';
    latency?: number;
  };
  requests: {
    total: string;
    errors: string;
    errorRate: string;
    averageLatency: string;
  };
  slowQueries: {
    total: string;
    threshold: string;
  };
  memory: {
    heapUsed: string;
    heapTotal: string;
    rss: string;
  };
  operations: Record<string, {
    count: number;
    avgLatency: string;
    slowCount: number;
    slowPercentage: string;
  }>;
  dependencies: {
    email: { status: 'configured' | 'unconfigured' | 'error'; provider?: string };
    queue: { status: 'ok' | 'degraded' | 'error'; queued: number; failed: number; paused: boolean };
    payments: { status: 'configured' | 'unconfigured'; provider: string };
  };
}

/**
 * HealthService - Provides health check implementations
 * 
 * Monitors:
 * - Backend process availability
 * - Database connectivity
 * - Response times and latency
 * 
 * Used for alerting when services become unhealthy.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly version = process.env.BACKEND_VERSION || process.env.APP_VERSION || process.env.npm_package_version || 'unknown';
  private readonly commit = process.env.BACKEND_COMMIT || process.env.GITHUB_SHA || process.env.GIT_COMMIT || this.gitCommit();
  private startTime = new Date();

  constructor(
    private prisma: PrismaService,
    private structuredLogger: StructuredLogger,
  ) {}

  private gitCommit() {
    try {
      return execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return 'unknown';
    }
  }

  private async dependencyHealth(): Promise<HealthDashboard['dependencies']> {
    const paymentsConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
    let email: HealthDashboard['dependencies']['email'] = {
      status: process.env.SMTP_HOST && process.env.SMTP_USER ? 'configured' : 'unconfigured',
      provider: process.env.SMTP_HOST ? 'SMTP' : undefined,
    };
    let queue: HealthDashboard['dependencies']['queue'] = { status: 'ok', queued: 0, failed: 0, paused: false };
    try {
      const providers = await this.prisma.query<any>('SELECT provider FROM EmailProviderConfig WHERE isActive = 1 LIMIT 1');
      if (providers[0]) email = { status: 'configured', provider: providers[0].provider };
      const counts = await this.prisma.query<any>(
        `SELECT
           SUM(CASE WHEN status = 'QUEUED' THEN 1 ELSE 0 END) AS queued,
           SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed
         FROM EmailDelivery`,
      );
      const controls = await this.prisma.query<any>("SELECT paused FROM EmailQueueControl WHERE id = 'global-email-queue' LIMIT 1");
      const queued = Number(counts[0]?.queued || 0);
      const failed = Number(counts[0]?.failed || 0);
      const paused = Boolean(controls[0]?.paused);
      queue = { status: paused || failed > 25 ? 'degraded' : 'ok', queued, failed, paused };
    } catch {
      queue = { status: 'error', queued: 0, failed: 0, paused: false };
      if (email.status === 'unconfigured') email = { status: 'error' };
    }
    return {
      email,
      queue,
      payments: { status: paymentsConfigured ? 'configured' : 'unconfigured', provider: 'PAYPAL' },
    };
  }

  /**
   * Comprehensive health check with database verification
   */
  async check(): Promise<HealthCheckResponse> {
    try {
      const startDb = Date.now();
      // Test database connection with a simple query
      await this.prisma.query<any>('SELECT 1 as healthy');
      const dbLatency = Date.now() - startDb;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: this.version,
        commit: this.commit,
        database: {
          status: 'ok',
          latency: dbLatency,
        },
      };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      throw new ServiceUnavailableException({
        status: 'error',
        timestamp: new Date().toISOString(),
        version: this.version,
        commit: this.commit,
        database: {
          status: 'error',
        },
        message: 'Database connection failed',
      });
    }
  }

  /**
   * Readiness probe: Check if service is ready to accept traffic
   */
  async ready(): Promise<HealthCheckResponse> {
    try {
      const startDb = Date.now();
      await this.prisma.query<any>('SELECT 1 as healthy');
      const dbLatency = Date.now() - startDb;

      // Consider service ready if database responds within reasonable time (< 5s)
      if (dbLatency > 5000) {
        this.logger.warn(`Database is slow: ${dbLatency}ms`);
        return {
          status: 'degraded',
          timestamp: new Date().toISOString(),
          version: this.version,
          commit: this.commit,
          database: {
            status: 'ok',
            latency: dbLatency,
          },
        };
      }

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: this.version,
        commit: this.commit,
        database: {
          status: 'ok',
          latency: dbLatency,
        },
      };
    } catch (error) {
      this.logger.error('Readiness check failed:', error);
      throw new ServiceUnavailableException({
        status: 'error',
        timestamp: new Date().toISOString(),
        version: this.version,
        commit: this.commit,
        message: 'Service not ready',
      });
    }
  }

  /**
   * Liveness probe: Check if service is alive
   * Does not check dependencies to avoid cascading failures
   */
  async live(): Promise<HealthCheckResponse> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: this.version,
      commit: this.commit,
      database: {
        status: 'ok',
      },
    };
  }

  /**
   * Comprehensive dashboard with full metrics and monitoring data
   * 
   * Returns:
   * - Overall health status
   * - Uptime information
   * - Database health and latency
   * - Request metrics (total, errors, error rate, latency)
   * - Slow query statistics
   * - Memory usage
   * - Per-operation performance metrics
   * 
   * Used for monitoring dashboards and detailed health analysis
   */
  async dashboard(): Promise<HealthDashboard> {
    try {
      const uptime = Date.now() - this.startTime.getTime();
      const uptimeSeconds = Math.floor(uptime / 1000);
      
      // Calculate uptime in readable format
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);
      const seconds = uptimeSeconds % 60;
      const readableUptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;

      // Test database connectivity
      const dbStart = Date.now();
      await this.prisma.query<any>('SELECT 1 as healthy');
      const dbLatency = Date.now() - dbStart;

      // Get metrics from structured logger
      const metrics = this.structuredLogger.getMetrics();

      // Get memory usage
      const memUsage = process.memoryUsage();
      const dependencies = await this.dependencyHealth();

      // Determine overall health status
      let status: 'ok' | 'degraded' | 'error' = 'ok';
      const errorRate = parseFloat(metrics.requests.errorRate.replace('%', ''));
      if (errorRate > 5) {
        status = 'degraded';
      }
      if (dbLatency > 5000 || errorRate > 10) {
        status = 'degraded';
      }
      if (dependencies.queue.status !== 'ok') status = 'degraded';

      return {
        status,
        timestamp: new Date().toISOString(),
        version: this.version,
        commit: this.commit,
        uptime: {
          seconds: uptimeSeconds,
          readable: readableUptime,
        },
        database: {
          status: 'ok',
          latency: dbLatency,
        },
        requests: {
          total: metrics.requests.total.toString(),
          errors: metrics.requests.errors.toString(),
          errorRate: metrics.requests.errorRate,
          averageLatency: metrics.requests.averageLatency,
        },
        slowQueries: {
          total: metrics.slowQueries.total.toString(),
          threshold: metrics.slowQueries.threshold,
        },
        memory: {
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
          rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
        },
        operations: metrics.operations,
        dependencies,
      };
    } catch (error) {
      this.logger.error('Dashboard health check failed:', error);
      throw new ServiceUnavailableException({
        status: 'error',
        timestamp: new Date().toISOString(),
        version: this.version,
        commit: this.commit,
        message: 'Failed to generate health dashboard',
      });
    }
  }
}
