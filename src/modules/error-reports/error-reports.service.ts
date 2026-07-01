import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ErrorReportsService {
  constructor(private prisma: PrismaService) {}

  async create(body: Record<string, any>, userAgent: string | null) {
    const message = String(body.message || body.reason || 'Unknown client error').slice(0, 1000);
    const stack = body.stack ? String(body.stack).slice(0, 8000) : null;
    const source = body.source ? String(body.source).slice(0, 120) : 'frontend';
    const path = body.path ? String(body.path).slice(0, 500) : null;
    const userId = body.userId ? String(body.userId).slice(0, 191) : null;
    const companyId = body.companyId ? String(body.companyId).slice(0, 191) : null;

    await this.prisma.execute(
      `INSERT INTO ErrorReport (id, source, message, stack, path, userAgent, userId, companyId, metadata, createdAt)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [source, message, stack, path, userAgent, userId, companyId, JSON.stringify(body.metadata || {})],
    ).catch(() => undefined);

    return { accepted: true };
  }
}
