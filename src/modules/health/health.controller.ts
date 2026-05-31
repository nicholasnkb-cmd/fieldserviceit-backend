import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    const checks: Record<string, any> = {};

    checks.timestamp = new Date().toISOString();
    checks.version = {
      frontend: process.env.FRONTEND_VERSION || process.env.APP_VERSION || 'unknown',
      backend: process.env.BACKEND_VERSION || process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
      environment: process.env.NODE_ENV || 'development',
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok' };
    } catch {
      checks.database = { status: 'error' };
    }

    checks.pool = { status: 'ok' };
    checks.worker = await this.getMonitoringWorkerStatus();

    const statuses = Object.values(checks).filter((c: any) => typeof c === 'object' && c !== null && 'status' in c);
    const allOk = statuses.length === 0 || statuses.every((c: any) => c.status === 'ok' || c.status === 'unknown');
    return { status: allOk ? 'ok' : 'degraded', ...checks };
  }

  @Get('ping')
  ping() {
    return { pong: true, timestamp: new Date().toISOString() };
  }

  private async getMonitoringWorkerStatus() {
    try {
      const rows = await this.prisma.query<any[]>(
        `SELECT MAX(createdAt) as lastPollAt, COUNT(*) as snapshotsLastHour
         FROM NetworkHealthSnapshot
         WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      );
      const row = rows[0] || {};
      return {
        status: 'ok',
        lastPollAt: row.lastPollAt || null,
        snapshotsLastHour: Number(row.snapshotsLastHour || 0),
      };
    } catch {
      return { status: 'unknown', lastPollAt: null, snapshotsLastHour: 0 };
    }
  }
}
