import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DatabaseService } from './database.service';
import { MigrationsService } from './migrations/migrations.service';

@Global()
@Module({
  providers: [PrismaService, DatabaseService, MigrationsService],
  exports: [PrismaService, DatabaseService, MigrationsService],
})
export class DatabaseModule {}
