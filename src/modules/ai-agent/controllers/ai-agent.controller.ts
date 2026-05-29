import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AiAgentService } from '../services/ai-agent.service';

@Controller('ai-agent')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AiAgentController {
  constructor(private aiAgentService: AiAgentService) {}

  @Get('tools')
  listTools() {
    return this.aiAgentService.listTools();
  }

  @Post('plan')
  plan(@Body() body: { goal: string }, @CurrentUser() user: any) {
    return this.aiAgentService.plan(body.goal, user);
  }

  @Post('execute')
  execute(@Body() body: { goal: string; approvedActions?: string[] }, @CurrentUser() user: any) {
    return this.aiAgentService.execute(body.goal, user, body.approvedActions || []);
  }
}
