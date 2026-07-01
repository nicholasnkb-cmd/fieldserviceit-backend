import { Module } from '@nestjs/common';
import { PublicTopologyController, TopologyController } from './topology.controller';
import { TopologyService } from './topology.service';

@Module({
  controllers: [TopologyController, PublicTopologyController],
  providers: [TopologyService],
})
export class TopologyModule {}
