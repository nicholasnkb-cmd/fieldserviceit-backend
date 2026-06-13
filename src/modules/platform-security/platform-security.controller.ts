import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { PlatformSecurityService } from './platform-security.service';
import { StepUpGuard } from '../../common/guards/step-up.guard';
import { RequireStepUp } from '../../common/decorators/step-up.decorator';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../common/guards/permissions.guard';

@Controller('platform-security')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, RolesGuard, StepUpGuard, PermissionsGuard)
@Roles('SUPER_ADMIN', 'TENANT_ADMIN')
export class PlatformSecurityController {
  constructor(private readonly service: PlatformSecurityService) {}

  @RequirePermissions('platform-security.view')
  @Get('dashboard')
  @Roles('SUPER_ADMIN')
  dashboard() {
    return this.service.dashboard();
  }

  @RequirePermissions('platform-security.view')
  @Get('policy')
  @Roles('SUPER_ADMIN')
  policy() {
    return this.service.securityPolicy();
  }

  @RequirePermissions('platform-security.manage')
  @Patch('policy')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  updatePolicy(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.updateSecurityPolicy(user, body);
  }

  @RequirePermissions('platform-security.view')
  @Get('policy/history')
  @Roles('SUPER_ADMIN')
  policyHistory() {
    return this.service.securityPolicyHistory();
  }

  @RequirePermissions('platform-security.manage')
  @Post('policy/history/:id/rollback')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  rollbackPolicy(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.service.rollbackSecurityPolicy(user, id);
  }

  @RequirePermissions('platform-security.view')
  @Get('oidc')
  oidcProviders(@CurrentUser() user: CurrentUserType) {
    return this.service.listOidcProviders(user);
  }

  @RequirePermissions('platform-security.manage')
  @Post('oidc')
  saveOidcProvider(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.saveOidcProvider(user, body);
  }

  @RequirePermissions('platform-security.manage')
  @Patch('oidc/:id')
  updateOidcProvider(@Param('id') id: string, @CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.saveOidcProvider(user, body, id);
  }

  @RequirePermissions('platform-security.manage')
  @Post('oidc/:id/test')
  testOidcProvider(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.service.testOidcProvider(user, id);
  }

  @RequirePermissions('platform-security.manage')
  @Delete('oidc/:id')
  deleteOidcProvider(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.service.deleteOidcProvider(user, id);
  }

  @RequirePermissions('platform-security.view')
  @Get('backups/policy')
  @Roles('SUPER_ADMIN')
  backupPolicy() {
    return this.service.backupPolicy();
  }

  @RequirePermissions('platform-security.manage')
  @Patch('backups/policy')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  updateBackupPolicy(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.updateBackupPolicy(user, body);
  }

  @RequirePermissions('platform-security.view')
  @Get('backups')
  @Roles('SUPER_ADMIN')
  backups() {
    return this.service.listBackupRuns();
  }

  @RequirePermissions('platform-security.manage')
  @Post('backups/run')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  runBackup(@CurrentUser() user: CurrentUserType) {
    return this.service.runBackup(user.id);
  }

  @RequirePermissions('platform-security.manage')
  @Post('backups/:id/test')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  testBackup(@Param('id') id: string) {
    return this.service.testBackup(id);
  }

  @RequirePermissions('platform-security.view')
  @Get('retention')
  @Roles('SUPER_ADMIN')
  retentionPolicy() {
    return this.service.retentionPolicy();
  }

  @RequirePermissions('platform-security.manage')
  @Patch('retention')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  updateRetentionPolicy(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.updateRetentionPolicy(user, body);
  }

  @RequirePermissions('platform-security.manage')
  @Post('retention/run')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  runRetention() {
    return this.service.runRetention();
  }

  @RequirePermissions('platform-security.view')
  @Get('approvals')
  approvals(@CurrentUser() user: CurrentUserType) {
    return this.service.pendingApprovals(user);
  }

  @RequirePermissions('platform-security.manage')
  @Post('approvals/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: CurrentUserType, @Body() body: { note?: string }) {
    return this.service.decideNetworkAction(user, id, 'APPROVE', body.note);
  }

  @RequirePermissions('platform-security.manage')
  @Post('approvals/:id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: CurrentUserType, @Body() body: { note?: string }) {
    return this.service.decideNetworkAction(user, id, 'REJECT', body.note);
  }

  @RequirePermissions('platform-security.view')
  @Get('scans')
  @Roles('SUPER_ADMIN')
  scans() {
    return this.service.scanSummary();
  }
}
