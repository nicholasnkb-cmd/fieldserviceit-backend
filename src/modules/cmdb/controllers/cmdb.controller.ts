import { Controller, Get, Post, Patch, Put, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
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
import { CreateEnrollmentTokenDto } from '../dto/create-enrollment-token.dto';
import { CreateNetworkCredentialDto } from '../dto/create-network-credential.dto';
import { RotateNetworkCredentialDto } from '../dto/rotate-network-credential.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';

@Controller('assets')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard)
@BusinessOnly()
@RequireFeature('assets')
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
  createEnrollmentToken(@Body() dto: CreateEnrollmentTokenDto, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.createEnrollmentToken(user.companyId, dto);
  }

  @Get('mdm/enrollment-tokens')
  listEnrollmentTokens(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listEnrollmentTokens(user.companyId);
  }

  @Get('network/monitoring/summary')
  getNetworkMonitoringSummary(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.getNetworkMonitoringSummary(user.companyId);
  }

  @Get('network/alert-events')
  listNetworkAlertEvents(@Query('status') status: string | undefined, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listNetworkAlertEvents(user.companyId, status);
  }

  @Get('network/maintenance-windows')
  listMaintenanceWindows(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listMaintenanceWindows(user.companyId);
  }

  @Post('network/maintenance-windows')
  createMaintenanceWindow(@Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.createMaintenanceWindow(user.companyId, body);
  }

  @Get('network/ip-reservations')
  listIpReservations(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listIpReservations(user.companyId);
  }

  @Post('network/ip-reservations')
  createIpReservation(@Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.createIpReservation(user.companyId, body);
  }

  @Get('network/discovery')
  listDiscoveryResults(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listDiscoveryResults(user.companyId);
  }

  @Post('network/discovery/scan')
  scanSubnet(@Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.scanSubnet(user.companyId, body);
  }

  @Get('network/vendor-mappings')
  listVendorMappings(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listVendorMappings();
  }

  @Get('network/credentials')
  @RequirePermissions('network.credentials.view')
  listNetworkCredentials(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listNetworkCredentials(user.companyId);
  }

  @Post('network/credentials')
  @RequirePermissions('network.credentials.manage')
  createNetworkCredential(@Body() body: CreateNetworkCredentialDto, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.createNetworkCredential(user.companyId, body, user.id);
  }

  @Post('network/credentials/:credentialId/test')
  @RequirePermissions('network.credentials.manage')
  testNetworkCredential(@Param('credentialId') credentialId: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.testNetworkCredential(credentialId, user.companyId, user.id);
  }

  @Post('network/credentials/:credentialId/rotate')
  @RequirePermissions('network.credentials.manage')
  rotateNetworkCredential(@Param('credentialId') credentialId: string, @Body() body: RotateNetworkCredentialDto, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.rotateNetworkCredential(credentialId, user.companyId, body, user.id);
  }

  @Get('network/escalation-policies')
  listEscalationPolicies(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listEscalationPolicies(user.companyId);
  }

  @Post('network/escalation-policies')
  createEscalationPolicy(@Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.createEscalationPolicy(user.companyId, body, user.id);
  }

  @Get('network/syslog-searches')
  listSyslogSavedSearches(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listSyslogSavedSearches(user.companyId);
  }

  @Post('network/syslog-searches')
  createSyslogSavedSearch(@Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.createSyslogSavedSearch(user.companyId, body);
  }

  @Get('network/retention-policy')
  getRetentionPolicy(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.getRetentionPolicy(user.companyId);
  }

  @Put('network/retention-policy')
  updateRetentionPolicy(@Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.updateRetentionPolicy(user.companyId, body, user.id);
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

  @Get(':id/network-monitoring')
  getNetworkMonitoring(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.getNetworkMonitoring(id, user.companyId);
  }

  @Put(':id/network-monitoring')
  updateNetworkMonitoring(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.updateNetworkMonitoring(id, user.companyId, body);
  }

  @Post(':id/network-monitoring/ping')
  runPingCheck(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.runPingCheck(id, user.companyId);
  }

  @Post(':id/network-monitoring/snmp')
  runSnmpPoll(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.runSnmpPoll(id, user.companyId);
  }

  @Get(':id/network-monitoring/snapshots')
  listNetworkSnapshots(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listNetworkSnapshots(id, user.companyId, Number(limit) || 25);
  }

  @Get(':id/network-monitoring/series')
  listSnapshotSeries(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listSnapshotSeries(id, user.companyId, Number(limit) || 60);
  }

  @Get(':id/interfaces')
  listInterfaceMetrics(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listInterfaceMetrics(id, user.companyId);
  }

  @Get(':id/firmware')
  listFirmwareInventory(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listFirmwareInventory(id, user.companyId);
  }

  @Get(':id/syslog')
  listSyslogEvents(@Param('id') id: string, @Query('limit') limit: string | undefined, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listSyslogEvents(id, user.companyId, Number(limit) || 50);
  }

  @Post(':id/syslog')
  ingestSyslogEvent(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.ingestSyslogEvent(id, user.companyId, body);
  }

  @Get(':id/alert-rules')
  listAlertRules(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listAlertRules(id, user.companyId);
  }

  @Post(':id/alert-rules')
  createAlertRule(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.createAlertRule(id, user.companyId, body);
  }

  @Patch(':id/alert-rules/:ruleId')
  updateAlertRule(@Param('id') id: string, @Param('ruleId') ruleId: string, @Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.updateAlertRule(id, ruleId, user.companyId, body);
  }

  @Get(':id/config-backups')
  listConfigBackups(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listConfigBackups(id, user.companyId);
  }

  @Post(':id/config-backups')
  createConfigBackup(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.createConfigBackup(id, user.companyId, body);
  }

  @Get(':id/config-backups/diff')
  diffConfigBackups(@Param('id') id: string, @Query('from') from: string, @Query('to') to: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.diffConfigBackups(id, user.companyId, from, to);
  }

  @Get(':id/device-actions')
  listDeviceActions(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.listDeviceActions(id, user.companyId);
  }

  @Post(':id/device-actions')
  @RequirePermissions('network.actions.run')
  queueDeviceAction(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.queueDeviceAction(id, user.companyId, body, user.id);
  }

  @Post(':id/device-actions/:actionId/execute')
  @RequirePermissions('network.actions.run')
  executeDeviceAction(@Param('id') id: string, @Param('actionId') actionId: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.executeDeviceAction(id, actionId, user.companyId, user.id);
  }

  @Post(':id/vendor-sync')
  runVendorSync(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.runVendorSync(id, user.companyId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    if (!user.companyId) throw new ForbiddenException('No company context available');
    return this.cmdbService.remove(id, user.companyId);
  }
}
