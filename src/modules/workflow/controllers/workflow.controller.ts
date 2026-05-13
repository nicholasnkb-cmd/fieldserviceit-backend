import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { WorkflowService } from '../services/workflow.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('workflows')
@UseGuards(JwtAuthGuard, TenantGuard)
export class WorkflowController {
  constructor(private workflowService: WorkflowService) {}

  @Post()
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.workflowService.create(dto, user.companyId);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.workflowService.findAll(user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.workflowService.findOne(id, user.companyId);
  }

  @Post(':id/execute')
  execute(@Param('id') id: string, @Body('ticketId') ticketId: string, @CurrentUser() user: any) {
    return this.workflowService.execute(id, ticketId, user.companyId);
  }

  @Get(':id/runs')
  getRuns(@Param('id') id: string, @CurrentUser() user: any) {
    return this.workflowService.getRuns(id, user.companyId);
  }
}
