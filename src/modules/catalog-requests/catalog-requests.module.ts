import { Module } from '@nestjs/common';
import { CatalogRequestsController } from './catalog-requests.controller';
import { CatalogRequestsService } from './catalog-requests.service';

@Module({
  controllers: [CatalogRequestsController],
  providers: [CatalogRequestsService],
  exports: [CatalogRequestsService],
})
export class CatalogRequestsModule {}
