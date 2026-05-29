import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async check() {
    const checks: Record<string, any> = {};

    checks.timestamp = new Date().toISOString();

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok' };
    } catch {
      checks.database = { status: 'error' };
    }

    checks.pool = { status: 'ok' };

    const statuses = Object.values(checks).filter((c: any) => typeof c === 'object' && c !== null);
    const allOk = statuses.length === 0 || statuses.every((c: any) => c.status === 'ok' || c.status === 'unknown');
    return { status: allOk ? 'ok' : 'degraded', ...checks };
  }

  @Get('ping')
  ping() {
    return { pong: true, timestamp: new Date().toISOString() };
  }
}
