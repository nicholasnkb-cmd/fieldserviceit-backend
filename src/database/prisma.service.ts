import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: ['error', 'warn'],
    });
  }

  async onModuleInit() {
    try {
      await Promise.race([
        this.$connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timed out after 10s')), 10000)),
      ]);
      this.logger.log('Database connected successfully');
    } catch (err) {
      this.logger.error('Database connection failed, continuing without DB');
      this.logger.error(err instanceof Error ? err.message : String(err));
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
