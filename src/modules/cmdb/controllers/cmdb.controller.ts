import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { CmdbService } from '../services/cmdb.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CreateAssetDto } from '../dto/create-asset.dto';
import { UpdateAssetDto } from '../dto/update-asset.dto';

@Controller('assets')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard)
@BusinessOnly()
export class CmdbController {
  constructor(private cmdbService: CmdbService) {}

  @Post()
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.create(dto, user.companyId);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.findAll(user.companyId, query);
  }

  @Get('mdm/summary')
  getMdmSummary(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.getMdmSummary(user.companyId);
  }

  @Post('mdm/enrollment-tokens')
  createEnrollmentToken(@Body() dto: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.createEnrollmentToken(user.companyId, dto);
  }

  @Get('mdm/enrollment-tokens')
  listEnrollmentTokens(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listEnrollmentTokens(user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.findOne(id, user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.update(id, dto, user.companyId);
  }

  @Post(':id/check-in')
  checkIn(@Param('id') id: string, @Body() dto: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.checkIn(id, dto, user.companyId);
  }

  @Get(':id/commands')
  listCommands(@Param('id') id: string, @Query('status') status: string | undefined, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listDeviceCommands(id, user.companyId, status);
  }

  @Post(':id/actions/:action')
  runDeviceAction(@Param('id') id: string, @Param('action') action: string, @Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.runDeviceAction(id, action, body, user.companyId, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.remove(id, user.companyId);
  }
}
