import { Injectable, Optional } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { MigrationsService } from './migrations/migrations.service';

@Injectable()
export class PrismaService extends DatabaseService {
  constructor(@Optional() migrationsService?: MigrationsService) {
    super(migrationsService);
  }
}
