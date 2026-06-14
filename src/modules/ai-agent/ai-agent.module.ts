import { Module } from '@nestjs/common';
import { AiAgentController } from './controllers/ai-agent.controller';
import { AiAgentService } from './services/ai-agent.service';
import { AiModelService } from './services/ai-model.service';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [TicketsModule],
  controllers: [AiAgentController],
  providers: [AiAgentService, AiModelService],
})
export class AiAgentModule {}
