import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { WorkflowService } from '../services/workflow.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';

@Controller('workflows')
@UseGuards(JwtAuthGuard, TenantGuard, FeatureAccessGuard)
@RequireFeature('workflows')
export class WorkflowController {
  constructor(private workflowService: WorkflowService) {}

  @Post()
  create(@Body() dto: { name: string; description?: string; triggerOn?: string; steps: any[] }, @CurrentUser() user: CurrentUserType) {
    return this.workflowService.create(dto, user.companyId);
  }

  @Get()
  findAll(@CurrentUser() user: CurrentUserType) {
    return this.workflowService.findAll(user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.workflowService.findOne(id, user.companyId);
  }

  @Post(':id/execute')
  execute(@Param('id') id: string, @Body('ticketId') ticketId: string, @CurrentUser() user: CurrentUserType) {
    return this.workflowService.execute(id, ticketId, user.companyId);
  }

  @Get(':id/runs')
  getRuns(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.workflowService.getRuns(id, user.companyId);
  }
}
