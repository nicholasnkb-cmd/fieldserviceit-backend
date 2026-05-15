import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class PrismaService extends DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected (mysql2)');
    } catch (err) {
      this.logger.warn('Database unavailable: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
