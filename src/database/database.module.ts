import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DatabaseService } from './database.service';
import { MigrationsService } from './migrations/migrations.service';
import { AuthorizationRepository } from './repositories/authorization.repository';
import { SessionRepository } from './repositories/session.repository';
import { AssetRepository } from './repositories/asset.repository';

@Global()
@Module({
  providers: [PrismaService, DatabaseService, MigrationsService, AuthorizationRepository, SessionRepository, AssetRepository],
  exports: [PrismaService, DatabaseService, MigrationsService, AuthorizationRepository, SessionRepository, AssetRepository],
})
export class DatabaseModule {}
