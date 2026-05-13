import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { CmdbService } from '../services/cmdb.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('assets')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard)
@BusinessOnly()
export class CmdbController {
  constructor(private cmdbService: CmdbService) {}

  @Post()
  create(@Body() dto: any, @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.create(dto, user.companyId);
  }

  @Get()
  findAll(@Query() query: any, @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.findAll(user.companyId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.findOne(id, user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.update(id, dto, user.companyId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.remove(id, user.companyId);
  }
}
