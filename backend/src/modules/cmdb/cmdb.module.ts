import { Module } from '@nestjs/common';
import { CmdbController } from './controllers/cmdb.controller';
import { CmdbService } from './services/cmdb.service';

@Module({
  controllers: [CmdbController],
  providers: [CmdbService],
  exports: [CmdbService],
})
export class CmdbModule {}
