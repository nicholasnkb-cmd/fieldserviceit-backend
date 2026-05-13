import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { CompaniesService } from '../services/companies.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('companies')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard)
@BusinessOnly()
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: any) {
    return this.companiesService.create(dto);
  }

  @Get()
  findAll(@Query() query: any, @CurrentUser() user: any) {
    if (user.role === 'SUPER_ADMIN') {
      return this.companiesService.findAll(query);
    }
    return this.companiesService.findOne(user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    if (user.role !== 'SUPER_ADMIN' && id !== user.companyId) {
      throw new ForbiddenException('Access denied');
    }
    return this.companiesService.findOne(id);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string, @CurrentUser() user: any) {
    if (user.role !== 'SUPER_ADMIN' && id !== user.companyId) {
      throw new ForbiddenException('Access denied');
    }
    return this.companiesService.getStats(id);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.companiesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }
}
