import { Module } from '@nestjs/common';
import { AiAgentController } from './controllers/ai-agent.controller';
import { AiAgentService } from './services/ai-agent.service';

@Module({
  controllers: [AiAgentController],
  providers: [AiAgentService],
})
export class AiAgentModule {}
