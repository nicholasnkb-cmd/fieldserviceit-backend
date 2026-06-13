import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { WorkflowService } from '../services/workflow.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';
import { AuthorizationExempt } from '../../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@Controller('workflows')
@UseGuards(JwtAuthGuard, TenantGuard, FeatureAccessGuard, PermissionsGuard)
@RequireFeature('workflows')
export class WorkflowController {
  constructor(private workflowService: WorkflowService) {}

  @RequirePermissions('workflows.manage')
  @Post()
  create(@Body() dto: { name: string; description?: string; triggerOn?: string; steps: any[] }, @CurrentUser() user: CurrentUserType) {
    return this.workflowService.create(dto, user.companyId);
  }

  @RequirePermissions('workflows.view')
  @Get()
  findAll(@CurrentUser() user: CurrentUserType) {
    return this.workflowService.findAll(user.companyId);
  }

  @RequirePermissions('workflows.view')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.workflowService.findOne(id, user.companyId);
  }

  @RequirePermissions('workflows.manage')
  @Post(':id/execute')
  execute(@Param('id') id: string, @Body('ticketId') ticketId: string, @CurrentUser() user: CurrentUserType) {
    return this.workflowService.execute(id, ticketId, user.companyId);
  }

  @RequirePermissions('workflows.view')
  @Get(':id/runs')
  getRuns(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.workflowService.getRuns(id, user.companyId);
  }
}
