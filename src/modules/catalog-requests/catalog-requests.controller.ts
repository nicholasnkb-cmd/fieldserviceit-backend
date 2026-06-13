import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CatalogRequestsService } from './catalog-requests.service';
import { CreateCatalogRequestDto } from './dto/create-catalog-request.dto';
import { UpdateCatalogRequestDto } from './dto/update-catalog-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { BusinessOnly } from '../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Controller('catalog-requests')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@RequireFeature('catalogRequests')
export class CatalogRequestsController {
  constructor(private readonly catalogRequestsService: CatalogRequestsService) {}

  @RequirePermissions('catalog.view')
  @Get('items')
  findCatalogItems(@Query() query: any, @CurrentUser() user: any) {
    return this.catalogRequestsService.findCatalogItems(user, query);
  }

  @RequirePermissions('catalog.view')
  @Get('categories')
  findCatalogCategories(@CurrentUser() user: any) {
    return this.catalogRequestsService.findCatalogCategories(user);
  }

  @RequirePermissions('catalog.create')
  @Post()
  create(@Body() dto: CreateCatalogRequestDto, @CurrentUser() user: any) {
    return this.catalogRequestsService.create(dto, user.companyId, user.id);
  }

  @RequirePermissions('catalog.view')
  @Get()
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.catalogRequestsService.findAll(user, query);
  }

  @RequirePermissions('catalog.view')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogRequestsService.findOne(id, user);
  }

  @RequirePermissions('catalog.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCatalogRequestDto, @CurrentUser() user: any) {
    return this.catalogRequestsService.update(id, dto, user);
  }

  @RequirePermissions('catalog.manage')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogRequestsService.remove(id, user);
  }

  @BusinessOnly()
  @RequirePermissions('catalog.create')
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogRequestsService.approve(id, user.id, user);
  }

  @BusinessOnly()
  @RequirePermissions('catalog.create')
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body('reason') reason: string, @CurrentUser() user: any) {
    return this.catalogRequestsService.reject(id, reason, user);
  }

  @BusinessOnly()
  @RequirePermissions('catalog.create')
  @Post(':id/fulfill')
  fulfill(@Param('id') id: string, @CurrentUser() user: any) {
    return this.catalogRequestsService.fulfill(id, user);
  }
}
