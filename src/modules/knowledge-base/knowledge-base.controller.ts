import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { BusinessOnly } from '../../common/decorators/business-only.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { KnowledgeBaseService } from './knowledge-base.service';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Controller('knowledge-base')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
@RequireFeature('kb')
export class KnowledgeBaseController {
  constructor(private knowledgeBaseService: KnowledgeBaseService) {}

  @RequirePermissions('knowledge-base.view')
  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.summary(user);
  }

  @RequirePermissions('knowledge-base.view')
  @Get()
  findAll(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.knowledgeBaseService.findAll(user, query);
  }

  @RequirePermissions('knowledge-base.view')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.findOne(id, user);
  }

  @RequirePermissions('knowledge-base.manage')
  @Post()
  create(@Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.create(dto, user);
  }

  @RequirePermissions('knowledge-base.manage')
  @Post('from-ticket/:ticketId')
  createFromTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.createFromTicket(ticketId, user);
  }

  @RequirePermissions('knowledge-base.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.update(id, dto, user);
  }

  @RequirePermissions('knowledge-base.manage')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.remove(id, user);
  }
}
