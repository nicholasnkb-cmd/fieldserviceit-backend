import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AiAgentService } from '../services/ai-agent.service';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';
import { AuthorizationExempt } from '../../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@Controller('ai-agent')
@UseGuards(JwtAuthGuard, TenantGuard, FeatureAccessGuard, PermissionsGuard)
@RequireFeature('aiAgent')
export class AiAgentController {
  constructor(private aiAgentService: AiAgentService) {}

  @RequirePermissions('ai-agent.use')
  @Get('tools')
  listTools() {
    return this.aiAgentService.listTools();
  }

  @RequirePermissions('ai-agent.use')
  @Post('plan')
  plan(@Body() body: { goal: string }, @CurrentUser() user: any) {
    return this.aiAgentService.plan(body.goal, user);
  }

  @RequirePermissions('ai-agent.use')
  @Post('ask')
  ask(@Body() body: { question: string }, @CurrentUser() user: any) {
    return this.aiAgentService.ask(body.question, user);
  }

  @RequirePermissions('ai-agent.use')
  @Post('execute')
  execute(@Body() body: { goal: string; approvedActions?: string[] }, @CurrentUser() user: any) {
    return this.aiAgentService.execute(body.goal, user, body.approvedActions || []);
  }
}
