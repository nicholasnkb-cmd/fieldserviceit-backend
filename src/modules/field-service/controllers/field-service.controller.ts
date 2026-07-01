import { Controller, Get, Post, Patch, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { FieldServiceService } from '../services/field-service.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';

@Controller('dispatch')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
@RequireFeature('dispatch')
@RequirePermissions('dispatch.view')
export class FieldServiceController {
  constructor(private fieldService: FieldServiceService) {}

  @Post()
  @RequirePermissions('dispatch.create')
  dispatch(@Body() body: { ticketId: string; technicianId: string }, @CurrentUser() user: CurrentUserType) {
    const companyId = this.companyId(user);
    return this.fieldService.dispatch(body.ticketId, body.technicianId, companyId, user.id);
  }

  @Get('mobile/summary')
  mobileSummary(@CurrentUser() user: CurrentUserType) {
    return this.fieldService.mobileSummary(this.readCompanyId(user), user);
  }

  @Get('recommendations/:ticketId')
  @RequirePermissions('dispatch.view')
  recommendations(@Param('ticketId') ticketId: string, @CurrentUser() user: CurrentUserType) {
    return this.fieldService.recommendTechnicians(ticketId, this.companyId(user));
  }

  @Get()
  getBoard(@CurrentUser() user: CurrentUserType) {
    return this.fieldService.getDispatchBoard(this.readCompanyId(user));
  }

  @Get(':id/offline-packet')
  @RequirePermissions('dispatch.view')
  offlinePacket(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.fieldService.offlineJobPacket(id, this.companyId(user));
  }

  @Patch(':id')
  @RequirePermissions('dispatch.edit')
  updateStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: CurrentUserType) {
    return this.fieldService.updateStatus(id, status, this.companyId(user), user.id);
  }

  @Post(':id/checkin')
  @RequirePermissions('dispatch.edit')
  checkIn(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.fieldService.updateStatus(id, 'ON_SITE', this.companyId(user), user.id);
  }

  @Post(':id/checkout')
  @RequirePermissions('dispatch.edit')
  checkOut(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.fieldService.updateStatus(id, 'COMPLETED', this.companyId(user), user.id);
  }

  @Post(':id/notes')
  @RequirePermissions('dispatch.edit')
  addNotes(@Param('id') id: string, @Body('notes') notes: string, @CurrentUser() user: CurrentUserType) {
    return this.fieldService.addNotes(id, notes, this.companyId(user), user.id);
  }

  @Post(':id/signature')
  @RequirePermissions('dispatch.edit')
  addSignature(@Param('id') id: string, @Body('signature') signature: string, @CurrentUser() user: CurrentUserType) {
    return this.fieldService.addSignature(id, signature, this.companyId(user), user.id);
  }

  @Post(':id/photos')
  @RequirePermissions('dispatch.edit')
  addPhotos(@Param('id') id: string, @Body('photoUrls') photoUrls: string[], @CurrentUser() user: CurrentUserType) {
    return this.fieldService.addPhotos(id, photoUrls, this.companyId(user), user.id);
  }

  private readCompanyId(user: CurrentUserType) {
    if (user.role === 'SUPER_ADMIN' || user.role === 'GLOBAL_TECH') {
      return user.effectiveCompanyId || user.companyId || null;
    }
    return this.companyId(user);
  }

  private companyId(user: CurrentUserType) {
    const companyId = user.effectiveCompanyId || user.companyId;
    if (!companyId) throw new ForbiddenException('No company context available');
    return companyId;
  }
}
