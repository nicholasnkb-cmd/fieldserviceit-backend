import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [],
    });
  }

  async onModuleInit() {
    this.logger.log('PrismaService initialized (lazy connection on first query)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}