import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AiAgentService } from '../services/ai-agent.service';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';
import { AuthorizationExempt } from '../../../common/decorators/authorization-exempt.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AgentHistoryItem } from '../services/ai-model.service';

@Controller('ai-agent')
@UseGuards(JwtAuthGuard, TenantGuard, FeatureAccessGuard, RolesGuard)
@RequireFeature('aiAgent')
@Roles('TENANT_ADMIN', 'SUPER_ADMIN', 'TECHNICIAN', 'DISPATCHER')
export class AiAgentController {
  constructor(private aiAgentService: AiAgentService) {}

  @AuthorizationExempt('AI tools are tenant-scoped and restricted to supported operational roles', 'platform-operations', '2026-12-31')
  @Get('tools')
  listTools() {
    return this.aiAgentService.listTools();
  }

  @AuthorizationExempt('AI planning is tenant-scoped and restricted to supported operational roles', 'platform-operations', '2026-12-31')
  @Post('plan')
  plan(@Body() body: { goal: string; history?: AgentHistoryItem[]; currentPage?: string }, @CurrentUser() user: any) {
    return this.aiAgentService.plan(body.goal, user, body.history || [], body.currentPage);
  }

  @AuthorizationExempt('AI answers use tenant-scoped read tools and supported operational roles', 'platform-operations', '2026-12-31')
  @Post('ask')
  ask(@Body() body: { question: string; history?: AgentHistoryItem[]; currentPage?: string }, @CurrentUser() user: any) {
    return this.aiAgentService.ask(body.question, user, body.history || [], body.currentPage);
  }

  @AuthorizationExempt('AI execution is tenant-scoped, role-restricted, and separately approval-gated for writes', 'platform-operations', '2026-12-31')
  @Post('execute')
  execute(@Body() body: { goal: string; approvedActions?: string[]; history?: AgentHistoryItem[]; currentPage?: string }, @CurrentUser() user: any) {
    return this.aiAgentService.execute(body.goal, user, body.approvedActions || [], body.history || [], body.currentPage);
  }
}
