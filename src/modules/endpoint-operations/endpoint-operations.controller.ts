import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BusinessOnly } from '../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { EndpointOperationsService } from './endpoint-operations.service';

@Controller('endpoint-operations')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
@RequireFeature('assets')
export class EndpointOperationsController {
  constructor(private service: EndpointOperationsService) {}

  @Get('remote-access/summary')
  @RequirePermissions('remote-access.view')
  remoteSummary(@CurrentUser() user: CurrentUserType) {
    return this.service.remoteSummary(user);
  }

  @Get('remote-access/endpoints')
  @RequirePermissions('remote-access.view')
  remoteEndpoints(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listRemoteEndpoints(user, query);
  }

  @Post('remote-access/endpoints')
  @RequirePermissions('remote-access.manage')
  saveRemoteEndpoint(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.saveRemoteEndpoint(user, body);
  }

  @Post('remote-access/endpoints/:id/session')
  @RequirePermissions('remote-access.launch')
  launchRemoteSession(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() body: { authorizationConfirmed?: boolean }) {
    return this.service.launchRemoteSession(user, id, body?.authorizationConfirmed === true);
  }

  @Get('remote-access/sessions')
  @RequirePermissions('remote-access.view')
  remoteSessions(@CurrentUser() user: CurrentUserType) {
    return this.service.listRemoteSessions(user);
  }

  @Get('patches/summary')
  @RequirePermissions('patches.view')
  patchSummary(@CurrentUser() user: CurrentUserType) {
    return this.service.patchSummary(user);
  }

  @Get('patches/inventory')
  @RequirePermissions('patches.view')
  patchInventory(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listPatchInventory(user, query);
  }

  @Post('patches/inventory')
  @RequirePermissions('patches.manage')
  ingestPatchInventory(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.ingestPatchInventory(user, body);
  }

  @Get('patches/policies')
  @RequirePermissions('patches.view')
  patchPolicies(@CurrentUser() user: CurrentUserType) {
    return this.service.listPatchPolicies(user);
  }

  @Post('patches/policies')
  @RequirePermissions('patches.manage')
  createPatchPolicy(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.createPatchPolicy(user, body);
  }

  @Get('patches/jobs')
  @RequirePermissions('patches.view')
  patchJobs(@CurrentUser() user: CurrentUserType) {
    return this.service.listPatchJobs(user);
  }

  @Post('patches/jobs')
  @RequirePermissions('patches.deploy')
  createPatchJob(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.service.createPatchJob(user, body);
  }
}
