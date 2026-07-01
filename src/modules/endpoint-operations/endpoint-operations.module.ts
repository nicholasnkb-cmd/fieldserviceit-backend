import { Module } from '@nestjs/common';
import { CmdbModule } from '../cmdb/cmdb.module';
import { EndpointOperationsController } from './endpoint-operations.controller';
import { EndpointOperationsService } from './endpoint-operations.service';

@Module({
  imports: [CmdbModule],
  controllers: [EndpointOperationsController],
  providers: [EndpointOperationsService],
})
export class EndpointOperationsModule {}
