import { Controller, Get, Post, Patch, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { FieldServiceService } from '../services/field-service.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { BusinessOnly } from '../../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@Controller('dispatch')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard)
@BusinessOnly()
export class FieldServiceController {
  constructor(private fieldService: FieldServiceService) {}

  @Post()
  dispatch(@Body() body: { ticketId: string; technicianId: string }, @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.fieldService.dispatch(body.ticketId, body.technicianId, user.companyId);
  }

  @Get()
  getBoard(@CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.fieldService.getDispatchBoard(user.companyId);
  }

  @Patch(':id')
  updateStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.fieldService.updateStatus(id, status, user.companyId);
  }

  @Post(':id/notes')
  addNotes(@Param('id') id: string, @Body('notes') notes: string, @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.fieldService.addNotes(id, notes, user.companyId);
  }

  @Post(':id/signature')
  addSignature(@Param('id') id: string, @Body('signature') signature: string, @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.fieldService.addSignature(id, signature, user.companyId);
  }

  @Post(':id/photos')
  addPhotos(@Param('id') id: string, @Body('photoUrls') photoUrls: string[], @CurrentUser() user: any) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.fieldService.addPhotos(id, photoUrls, user.companyId);
  }
}
