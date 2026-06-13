import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { CompaniesService } from '../services/companies.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CreateCompanyDto } from '../dto/create-company.dto';
import { UpdateCompanyDto } from '../dto/update-company.dto';
import { AuthorizationExempt } from '../../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@Controller('companies')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, PermissionsGuard)
@BusinessOnly()
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @RequirePermissions('companies.manage')
  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @RequirePermissions('companies.view')
  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: CurrentUserType) {
    if (user.role === 'SUPER_ADMIN') {
      return this.companiesService.findAll(query);
    }
    return this.companiesService.findOne(user.companyId);
  }

  @RequirePermissions('companies.view')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (user.role !== 'SUPER_ADMIN' && id !== user.companyId) {
      throw new ForbiddenException('Access denied');
    }
    return this.companiesService.findOne(id);
  }

  @RequirePermissions('companies.view')
  @Get(':id/stats')
  getStats(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (user.role !== 'SUPER_ADMIN' && id !== user.companyId) {
      throw new ForbiddenException('Access denied');
    }
    return this.companiesService.getStats(id);
  }

  @RequirePermissions('companies.manage')
  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @RequirePermissions('companies.manage')
  @Delete(':id')
  @Roles('SUPER_ADMIN')
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }
}
