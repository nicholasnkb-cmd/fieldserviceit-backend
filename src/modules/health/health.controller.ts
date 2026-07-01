import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService, HealthCheckResponse, HealthDashboard } from './health.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MonitoringAccessGuard } from '../../common/guards/monitoring-access.guard';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';

/**
 * HealthController - Provides health check and liveness probe endpoints
 *
 * Used for:
 * - Kubernetes liveness/readiness probes
 * - Load balancer health checks
 * - Monitoring and alerting systems
 * - Uptime verification
 */
@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  /**
   * GET /v1/health - Basic health check
   *
   * Returns 200 if the backend is running and can connect to the database.
   * Returns 503 if database is unavailable.
   *
   * Response: { status: "ok", timestamp: "2026-06-10T12:00:00.000Z", version: "1.0.0" }
   */
  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthCheckResponse> {
    return this.healthService.check();
  }

  /**
   * GET /v1/health/ready - Readiness probe
   *
   * Returns 200 if the backend is ready to handle requests.
   * Includes database connectivity check.
   */
  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<HealthCheckResponse> {
    return this.healthService.ready();
  }

  /**
   * GET /v1/health/live - Liveness probe
   *
   * Returns 200 if the backend process is alive.
   * Lighter weight than readiness probe; does not check dependencies.
   */
  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  async live(): Promise<HealthCheckResponse> {
    return this.healthService.live();
  }

  /**
   * GET /v1/health/dashboard - Comprehensive health dashboard
   *
   * Returns detailed health metrics including:
   * - Overall health status
   * - Uptime information
   * - Database latency
   * - Request metrics (total, errors, error rate)
   * - Memory usage (heap and RSS)
   * - Per-operation performance metrics
   *
   * Used for monitoring dashboards and detailed diagnostics
   */
  @Get('dashboard')
  @Public()
  @UseGuards(JwtAuthGuard, MonitoringAccessGuard)
  @AuthorizationExempt('Restricted to monitoring credentials or authenticated administrators', 'security-team', '2026-09-30')
  @HttpCode(HttpStatus.OK)
  async dashboard(): Promise<HealthDashboard> {
    return this.healthService.dashboard();
  }
}
