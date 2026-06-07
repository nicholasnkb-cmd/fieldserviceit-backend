import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { PlatformSecurityService } from './platform-security.service';

@Controller('platform-security')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'TENANT_ADMIN')
export class PlatformSecurityController {
  constructor(private readonly service: PlatformSecurityService) {}

  @Get('dashboard')
  @Roles('SUPER_ADMIN')
  dashboard() {
    return this.service.dashboard();
  }

  @Get('policy')
  @Roles('SUPER_ADMIN')
  policy() {
    return this.service.securityPolicy();
  }

  @Patch('policy')
  @Roles('SUPER_ADMIN')
  updatePolicy(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.updateSecurityPolicy(user, body);
  }

  @Get('oidc')
  oidcProviders(@CurrentUser() user: CurrentUserType) {
    return this.service.listOidcProviders(user);
  }

  @Post('oidc')
  saveOidcProvider(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.saveOidcProvider(user, body);
  }

  @Patch('oidc/:id')
  updateOidcProvider(@Param('id') id: string, @CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.saveOidcProvider(user, body, id);
  }

  @Post('oidc/:id/test')
  testOidcProvider(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.service.testOidcProvider(user, id);
  }

  @Delete('oidc/:id')
  deleteOidcProvider(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.service.deleteOidcProvider(user, id);
  }

  @Get('backups/policy')
  @Roles('SUPER_ADMIN')
  backupPolicy() {
    return this.service.backupPolicy();
  }

  @Patch('backups/policy')
  @Roles('SUPER_ADMIN')
  updateBackupPolicy(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.updateBackupPolicy(user, body);
  }

  @Get('backups')
  @Roles('SUPER_ADMIN')
  backups() {
    return this.service.listBackupRuns();
  }

  @Post('backups/run')
  @Roles('SUPER_ADMIN')
  runBackup(@CurrentUser() user: CurrentUserType) {
    return this.service.runBackup(user.id);
  }

  @Post('backups/:id/test')
  @Roles('SUPER_ADMIN')
  testBackup(@Param('id') id: string) {
    return this.service.testBackup(id);
  }

  @Get('retention')
  @Roles('SUPER_ADMIN')
  retentionPolicy() {
    return this.service.retentionPolicy();
  }

  @Patch('retention')
  @Roles('SUPER_ADMIN')
  updateRetentionPolicy(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.updateRetentionPolicy(user, body);
  }

  @Post('retention/run')
  @Roles('SUPER_ADMIN')
  runRetention() {
    return this.service.runRetention();
  }

  @Get('approvals')
  approvals(@CurrentUser() user: CurrentUserType) {
    return this.service.pendingApprovals(user);
  }

  @Post('approvals/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserType, @Body() body: { note?: string }) {
    return this.service.decideNetworkAction(user, id, 'APPROVE', body.note);
  }

  @Post('approvals/:id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: CurrentUserType, @Body() body: { note?: string }) {
    return this.service.decideNetworkAction(user, id, 'REJECT', body.note);
  }

  @Get('scans')
  @Roles('SUPER_ADMIN')
  scans() {
    return this.service.scanSummary();
  }
}
