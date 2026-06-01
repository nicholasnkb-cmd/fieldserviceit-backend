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

@Controller('knowledge-base')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard)
@BusinessOnly()
@RequireFeature('kb')
export class KnowledgeBaseController {
  constructor(private knowledgeBaseService: KnowledgeBaseService) {}

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.summary(user);
  }

  @Get()
  findAll(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.knowledgeBaseService.findAll(user, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.findOne(id, user);
  }

  @Post()
  create(@Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.create(dto, user);
  }

  @Post('from-ticket/:ticketId')
  createFromTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.createFromTicket(ticketId, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.knowledgeBaseService.remove(id, user);
  }
}
