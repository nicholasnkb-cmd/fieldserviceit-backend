import { Controller, ForbiddenException, Get, NotFoundException, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdminService } from '../services/admin.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateCompanyDto } from '../dto/update-company.dto';
import { UpdateCompanySettingsDto } from '../dto/update-company-settings.dto';
import { UpdateFeatureOverridesDto } from '../dto/update-feature-overrides.dto';
import { UpdateUserFeatureControlsDto } from '../dto/update-user-feature-controls.dto';
import { BillingService } from '../../billing/services/billing.service';
import { AccessGovernanceService } from '../services/access-governance.service';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { StepUpGuard } from '../../../common/guards/step-up.guard';
import { RequireStepUp } from '../../../common/decorators/step-up.decorator';
import { AuthorizationExempt } from '../../../common/decorators/authorization-exempt.decorator';
import { TicketsService } from '../../tickets/services/tickets.service';
import { TicketTimelineService } from '../../tickets/services/ticket-timeline.service';
import { EmailDeliveryService } from '../../notifications/services/email-delivery.service';
import { PlatformOperationsService } from '../services/platform-operations.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, BusinessOnlyGuard, RolesGuard, PermissionsGuard, StepUpGuard)
export class AdminController {
  constructor(
    private adminService: AdminService,
    private billingService: BillingService,
    private accessGovernance: AccessGovernanceService,
    private ticketsService: TicketsService,
    private ticketTimelineService: TicketTimelineService,
    private emailDeliveryService: EmailDeliveryService,
    private platformOperations: PlatformOperationsService,
  ) {}

  private getCompanyId(user: CurrentUserType): string {
    const companyId = user.effectiveCompanyId || user.companyId;
    if (!companyId) throw new ForbiddenException('Select a company context for this admin operation');
    return companyId;
  }

  @RequirePermissions('permissions.governance.view')
  @Get('permissions')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  listPermissions() {
    return this.adminService.listPermissions();
  }

  @RequirePermissions('permissions.governance.view')
  @Get('permissions/workspace')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  getPermissionWorkspace(@CurrentUser() user: CurrentUserType) {
    return this.adminService.getPermissionWorkspace(user);
  }

  @RequirePermissions('permissions.governance.view')
  @Get('permissions/users/:userId/effective')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  getEffectivePermissions(@Param('userId') userId: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.getEffectivePermissions(userId, user);
  }

  @Get('permissions/governance')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.view')
  getPermissionGovernance(@CurrentUser() user: CurrentUserType) {
    return this.adminService.getPermissionGovernance(user);
  }

  @Post('permissions/approvals')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  requestPermissionApproval(
    @Body() dto: { roleId: string; permissionSlugs: string[]; reason?: string },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.requestPermissionApproval(dto.roleId, dto.permissionSlugs || [], dto.reason || '', user);
  }

  @Post('permissions/approvals/:id/review')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  reviewPermissionApproval(
    @Param('id') id: string,
    @Body('decision') decision: 'APPROVED' | 'REJECTED',
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.reviewPermissionApproval(id, decision, user);
  }

  @Post('permissions/temporary-grants')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  createTemporaryPermissionGrant(@Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.adminService.createTemporaryPermissionGrant(dto, user);
  }

  @Delete('permissions/temporary-grants/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  revokeTemporaryPermissionGrant(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.revokeTemporaryPermissionGrant(id, user);
  }

  @Post('permissions/scopes')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  createPermissionScope(@Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.adminService.createPermissionScope(dto, user);
  }

  @Delete('permissions/scopes/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  deletePermissionScope(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.deletePermissionScope(id, user);
  }

  @Get('permissions/users/:userId/simulate')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.view')
  simulateUserPermissions(@Param('userId') userId: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.simulateUserPermissions(userId, user);
  }

  @Get('permissions/alerts')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.view')
  getPermissionAlerts(@CurrentUser() user: CurrentUserType) {
    return this.adminService.getPermissionAlerts(user);
  }

  @Post('permissions/alerts/:id/acknowledge')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  acknowledgeSecurityAlert(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.acknowledgeSecurityAlert(id, user);
  }

  @Post('permissions/access-reviews')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  createAccessReview(@Body() dto: { name: string; dueAt?: string; cadence?: string; reminderDays?: number }, @CurrentUser() user: CurrentUserType) {
    return this.adminService.createAccessReview(dto, user);
  }

  @Get('permissions/access-reviews/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.view')
  getAccessReview(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.getAccessReview(id, user);
  }

  @Patch('permissions/access-reviews/:reviewId/items/:itemId')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  decideAccessReviewItem(
    @Param('reviewId') reviewId: string,
    @Param('itemId') itemId: string,
    @Body() dto: { decision: 'CERTIFIED' | 'REVOKE'; notes?: string },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.decideAccessReviewItem(reviewId, itemId, dto, user);
  }

  @Get('permissions/access-reviews/:id/export')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.view')
  @RequireStepUp()
  exportAccessReview(
    @Param('id') id: string,
    @Query('format') format: 'csv' | 'pdf' = 'csv',
    @Query('approvalRequestId') approvalRequestId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.exportAccessReview(id, format === 'pdf' ? 'pdf' : 'csv', user, approvalRequestId);
  }

  @Post('permissions/break-glass/:userId')
  @Roles('SUPER_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  setBreakGlassAccount(
    @Param('userId') userId: string,
    @Body() body: { enabled: boolean; reason?: string; approvalRequestId?: string },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.setBreakGlassAccount(userId, Boolean(body.enabled), body.reason || '', user, body.approvalRequestId);
  }

  @Post('permissions/service-accounts')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  createServiceAccount(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.adminService.createServiceAccount(body, user);
  }

  @Delete('permissions/service-accounts/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  revokeServiceAccount(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.revokeServiceAccount(id, user);
  }

  @Get('permissions/coverage')
  @Roles('SUPER_ADMIN')
  @RequirePermissions('permissions.governance.view')
  getAuthorizationCoverage() {
    return this.adminService.getAuthorizationCoverage();
  }

  @Post('permissions/elevations')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  requestElevation(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.requestElevation(body, user);
  }

  @Post('permissions/elevations/:id/review')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  reviewElevation(@Param('id') id: string, @Body('decision') decision: 'APPROVED' | 'REJECTED', @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.reviewElevation(id, decision, user);
  }

  @Post('permissions/dual-approvals')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  requestDualApproval(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.requestDualApproval(body, user);
  }

  @Post('permissions/dual-approvals/:id/review')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.manage')
  @RequireStepUp()
  reviewDualApproval(@Param('id') id: string, @Body('decision') decision: 'APPROVED' | 'REJECTED', @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.reviewDualApproval(id, decision, user);
  }

  @Post('permissions/relationships')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('relationships.manage')
  @RequireStepUp()
  addAuthorizationRelationship(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.addRelationship(body, user);
  }

  @Delete('permissions/relationships/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('relationships.manage')
  @RequireStepUp()
  removeAuthorizationRelationship(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.removeRelationship(id, user);
  }

  @Post('permissions/policy-simulations')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.view')
  simulateProposedPolicy(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.simulatePolicy(body, user);
  }

  @Get('permissions/policy-bundle')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('policy-bundles.manage')
  exportPolicyBundle(@CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.exportPolicyBundle(user);
  }

  @Post('permissions/policy-bundle')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('policy-bundles.manage')
  @RequireStepUp()
  importPolicyBundle(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.importPolicyBundle(body, user);
  }

  @Post('permissions/impact-preview')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.view')
  previewPermissionImpact(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.previewPermissionImpact(body, user);
  }

  @Post('permissions/contextual-policies')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('contextual-access.manage')
  @RequireStepUp()
  createContextualPolicy(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.createContextualPolicy(body, user);
  }

  @Delete('permissions/contextual-policies/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('contextual-access.manage')
  @RequireStepUp()
  deleteContextualPolicy(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.deleteContextualPolicy(id, user);
  }

  @Post('permissions/scim-group-mappings')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('scim.manage')
  @RequireStepUp()
  createScimGroupMapping(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.createScimGroupMapping(body, user);
  }

  @Delete('permissions/scim-group-mappings/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('scim.manage')
  @RequireStepUp()
  deleteScimGroupMapping(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.deleteScimGroupMapping(id, user);
  }

  @Post('permissions/access-requests/:id/review')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('access-requests.manage')
  @RequireStepUp()
  reviewAccessRequest(
    @Param('id') id: string,
    @Body('decision') decision: 'APPROVED' | 'REJECTED',
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.accessGovernance.reviewAccessRequest(id, decision, user);
  }

  @Post('permissions/authorization-tests')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('authorization-tests.manage')
  createAuthorizationTest(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.createAuthorizationTest(body, user);
  }

  @Post('permissions/authorization-tests/run')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('authorization-tests.manage')
  runAuthorizationTests(@CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.runAuthorizationTests(user);
  }

  @Get('permissions/evidence-pack')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('permissions.governance.view')
  @RequireStepUp()
  createEvidencePack(@CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.createEvidencePack(user);
  }

  @Post('permissions/impersonation/start')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('impersonation.use')
  @RequireStepUp()
  startImpersonation(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.startImpersonation(body, user);
  }

  @Post('permissions/impersonation/:id/end')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('impersonation.use')
  endImpersonation(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.endImpersonation(id, user);
  }

  @Post('permissions/scim-tokens')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('scim.manage')
  @RequireStepUp()
  createScimToken(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.createScimToken(body, user);
  }

  @Delete('permissions/scim-tokens/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('scim.manage')
  @RequireStepUp()
  revokeScimToken(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.revokeScimToken(id, user);
  }

  @Post('permissions/security-destinations')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('security-events.manage')
  @RequireStepUp()
  createSecurityDestination(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.createSecurityDestination(body, user);
  }

  @Post('permissions/security-destinations/:id/test')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('security-events.manage')
  @RequireStepUp()
  testSecurityDestination(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.testSecurityDestination(id, user);
  }

  @Get('plans')
  @Roles('SUPER_ADMIN')
  @RequirePermissions('billing.view')
  listPlans() {
    return this.adminService.listPlans();
  }

  @RequirePermissions('billing.manage')
  @Patch('plans/:id')
  @Roles('SUPER_ADMIN')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.adminService.updatePlan(id, dto);
  }

  @RequirePermissions('platform-security.view')
  @Get('system-readiness')
  @Roles('SUPER_ADMIN')
  getSystemReadiness() {
    return this.platformOperations.getSystemReadiness();
  }

  @RequirePermissions('platform-security.view')
  @Get('operations-overview')
  @Roles('SUPER_ADMIN')
  getOperationsOverview() {
    return this.platformOperations.overview();
  }

  @RequirePermissions('platform-security.manage')
  @Post('status-notices')
  @Roles('SUPER_ADMIN')
  createStatusNotice(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.platformOperations.createNotice(body, user);
  }

  @RequirePermissions('platform-security.manage')
  @Patch('status-notices/:id')
  @Roles('SUPER_ADMIN')
  updateStatusNotice(@Param('id') id: string, @Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.platformOperations.updateNotice(id, body, user);
  }

  @RequirePermissions('platform-security.manage')
  @Delete('status-notices/:id')
  @Roles('SUPER_ADMIN')
  deleteStatusNotice(@Param('id') id: string) {
    return this.platformOperations.deleteNotice(id);
  }

  @RequirePermissions('companies.manage')
  @Post('companies/cleanup-abandoned')
  @Roles('SUPER_ADMIN')
  cleanupAbandonedTenants(@Body('dryRun') dryRun?: boolean) {
    return this.platformOperations.cleanupAbandonedTenants(dryRun !== false);
  }

  @RequirePermissions('billing.view')
  @Get('billing/providers')
  @Roles('SUPER_ADMIN')
  getBillingProviders() {
    return this.billingService.getProviderReadiness();
  }

  @RequirePermissions('billing.manage')
  @Post('billing/paypal/test')
  @Roles('SUPER_ADMIN')
  testPayPal() {
    return this.billingService.testProvider();
  }

  @RequirePermissions('billing.view')
  @Get('billing/events')
  @Roles('SUPER_ADMIN')
  listBillingEvents(@Query('limit') limit?: number) {
    return this.billingService.listEvents(limit);
  }

  @RequirePermissions('billing.view')
  @Get('billing/prices')
  @Roles('SUPER_ADMIN')
  listBillingPrices() {
    return this.billingService.listPriceMappings();
  }

  @RequirePermissions('billing.manage')
  @Post('billing/prices')
  @Roles('SUPER_ADMIN')
  upsertBillingPrice(@Body() body: { planId: string; interval: string; component: string; externalPriceId: string; isActive?: boolean }) {
    return this.billingService.upsertPriceMapping(body);
  }

  @RequirePermissions('platform-security.view')
  @Get('function-controls')
  @Roles('SUPER_ADMIN')
  listFunctionControls() {
    return this.adminService.listFunctionControls();
  }

  @RequirePermissions('roles.view')
  @Get('roles')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  listRoles(@CurrentUser() user: CurrentUserType) {
    const companyId = user.role === 'SUPER_ADMIN' ? undefined : this.getCompanyId(user);
    return this.adminService.listRoles(companyId);
  }

  @RequirePermissions('roles.view')
  @Get('roles/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  getRole(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.getPermissionWorkspace(user).then((workspace: any) => {
      const role = workspace.roles.find((item: any) => item.id === id);
      if (!role) throw new NotFoundException('Role not found or outside your scope');
      return role;
    });
  }

  @RequirePermissions('roles.manage')
  @Post('roles')
  @Roles('SUPER_ADMIN')
  createRole(@Body() dto: { name: string; slug: string; description?: string; companyId?: string; permissionSlugs?: string[] }) {
    return this.adminService.createRole(dto);
  }

  @RequirePermissions('roles.manage')
  @Patch('roles/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequireStepUp()
  updateRole(
    @Param('id') id: string,
    @Body() dto: { name?: string; description?: string; permissionSlugs?: string[]; acknowledgeCriticalRemoval?: boolean },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.updateRole(id, dto, user);
  }

  @RequirePermissions('roles.manage')
  @Post('roles/:id/history/:historyId/rollback')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequireStepUp()
  rollbackRolePermissions(
    @Param('id') id: string,
    @Param('historyId') historyId: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.rollbackRolePermissions(id, historyId, user);
  }

  @RequirePermissions('roles.manage')
  @Post('roles/:id/analyze-permissions')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  analyzeRolePermissions(
    @Param('id') id: string,
    @Body('permissionSlugs') permissionSlugs: string[],
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.analyzePermissionChange(id, permissionSlugs || [], user);
  }

  @RequirePermissions('roles.manage')
  @Post('roles/:id/clone')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  cloneRole(
    @Param('id') id: string,
    @Body() dto: { name: string; slug: string; description?: string },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.cloneRole(id, dto, user);
  }

  @RequirePermissions('roles.manage')
  @Delete('roles/:id')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  deleteRole(@Param('id') id: string) {
    return this.adminService.deleteRole(id);
  }

  @RequirePermissions('roles.manage')
  @Post('users/:userId/roles/:roleId')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequireStepUp()
  assignUserRole(@Param('userId') userId: string, @Param('roleId') roleId: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.assignUserRole(userId, roleId, user);
  }

  @RequirePermissions('roles.manage')
  @Delete('users/:userId/roles/:roleId')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequireStepUp()
  removeUserRole(@Param('userId') userId: string, @Param('roleId') roleId: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.removeUserRole(userId, roleId, user);
  }

  @RequirePermissions('roles.view')
  @Get('users/:id/roles')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  getUserRoles(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.getUserRoles(id, user);
  }

  @RequirePermissions('roles.view')
  @Get('roles-legacy')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  listRolesLegacy() {
    return this.adminService.listRolesLegacy();
  }

  @RequirePermissions('users.view')
  @Get('users')
  @Roles('SUPER_ADMIN')
  listUsers(@Query() query: PaginationQueryDto) {
    return this.adminService.listUsers(query);
  }

  @RequirePermissions('tickets.view')
  @Get('tickets')
  @Roles('SUPER_ADMIN')
  listTickets(@Query() query: PaginationQueryDto & { status?: string; priority?: string }) {
    return this.adminService.listTickets(query);
  }

  @RequirePermissions('tickets.view')
  @Get('tickets/:id')
  @Roles('SUPER_ADMIN')
  getTicket(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.ticketsService.findOne(id, { ...user, companyId: null, effectiveCompanyId: null }, false);
  }

  @RequirePermissions('tickets.view')
  @Get('tickets/:id/timeline')
  @Roles('SUPER_ADMIN')
  async getTicketTimeline(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    await this.ticketsService.findOne(id, { ...user, companyId: null, effectiveCompanyId: null }, false);
    return this.ticketTimelineService.getTimeline(id, true);
  }

  @RequirePermissions('tickets.view')
  @Get('tickets/:id/email-deliveries')
  @Roles('SUPER_ADMIN')
  async getTicketEmailDeliveries(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    await this.ticketsService.findOne(id, { ...user, companyId: null, effectiveCompanyId: null }, false);
    return this.emailDeliveryService.ticketHistory(id);
  }

  @RequirePermissions('users.manage')
  @Post('users/bulk/status')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  bulkUserStatus(@Body() body: { ids: string[]; isActive: boolean }, @CurrentUser() user: CurrentUserType) {
    return this.platformOperations.bulkUserStatus(body.ids, body.isActive, user);
  }

  @RequirePermissions('users.view')
  @Get('users/:id')
  @Roles('SUPER_ADMIN')
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @RequirePermissions('users.manage')
  @Post('users')
  @Roles('SUPER_ADMIN')
  createUser(@Body() dto: { email: string; password: string; firstName: string; lastName: string; role?: string; companyId?: string }) {
    return this.adminService.createUser(dto);
  }

  @RequirePermissions('users.manage')
  @Patch('users/:id/role')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  updateUserRole(@Param('id') id: string, @Body('role') role: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.updateUserRole(id, role, user);
  }

  @RequirePermissions('users.manage')
  @Patch('users/:id')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: CurrentUserType) {
    return this.adminService.updateUser(id, dto, user);
  }

  @Patch('users/:id/company')
  @Roles('SUPER_ADMIN')
  @RequirePermissions('users.manage')
  @RequireStepUp()
  assignUserCompany(
    @Param('id') id: string,
    @Body() body: { companyId: string | null; reason?: string },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.adminService.assignUserCompany(id, body.companyId || null, body.reason || '', user);
  }

  @RequirePermissions('users.view')
  @Get('users/:id/feature-controls')
  @Roles('SUPER_ADMIN')
  getUserFeatureControls(@Param('id') id: string) {
    return this.adminService.getUserFeatureControls(id);
  }

  @RequirePermissions('users.manage')
  @Patch('users/:id/feature-controls')
  @Roles('SUPER_ADMIN')
  updateUserFeatureControls(@Param('id') id: string, @Body() dto: UpdateUserFeatureControlsDto) {
    return this.adminService.updateUserFeatureControls(id, dto);
  }

  @RequirePermissions('users.delete')
  @Delete('users/:id')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  removeUser(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.removeUser(id, user);
  }

  @RequirePermissions('companies.view')
  @Get('companies')
  @Roles('SUPER_ADMIN')
  listCompanies(@Query() query: PaginationQueryDto) {
    return this.adminService.listCompanies(query);
  }

  @RequirePermissions('companies.manage')
  @Post('companies')
  @Roles('SUPER_ADMIN')
  createCompany(@Body() dto: { name: string; slug: string; domain?: string }) {
    return this.adminService.createCompany(dto);
  }

  @RequirePermissions('companies.view')
  @Get('companies/:id/settings')
  @Roles('SUPER_ADMIN')
  getManagedCompanySettings(@Param('id') id: string) {
    return this.adminService.getCompanySettings(id);
  }

  @RequirePermissions('companies.manage')
  @Patch('companies/:id/settings')
  @Roles('SUPER_ADMIN')
  updateManagedCompanySettings(@Param('id') id: string, @Body() dto: UpdateCompanySettingsDto) {
    return this.adminService.updateCompanySettings(id, dto);
  }

  @RequirePermissions('companies.manage')
  @Patch('companies/:id/feature-overrides')
  @Roles('SUPER_ADMIN')
  updateCompanyFeatureOverrides(@Param('id') id: string, @Body() dto: UpdateFeatureOverridesDto) {
    return this.adminService.updateCompanyFeatureOverrides(id, dto);
  }

  @RequirePermissions('companies.view')
  @Get('companies/:id/feature-controls')
  @Roles('SUPER_ADMIN')
  getCompanyFeatureControls(@Param('id') id: string) {
    return this.adminService.getCompanyFeatureControls(id);
  }

  @RequirePermissions('companies.manage')
  @Patch('companies/:id')
  @Roles('SUPER_ADMIN')
  updateCompany(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.adminService.updateCompany(id, dto);
  }

  @RequirePermissions('companies.manage')
  @Delete('companies/:id')
  @Roles('SUPER_ADMIN')
  @RequireStepUp()
  removeCompany(@Param('id') id: string, @Query('approvalRequestId') approvalRequestId: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.removeCompany(id, user, approvalRequestId);
  }

  @RequirePermissions('companies.manage')
  @Post('companies/:id/invite-code')
  @Roles('SUPER_ADMIN')
  generateInviteCode(@Param('id') id: string, @Body('expiresInDays') expiresInDays?: number) {
    return this.adminService.generateInviteCode(id, expiresInDays);
  }

  @RequirePermissions('companies.manage')
  @Post('company-context/audit')
  @Roles('SUPER_ADMIN')
  auditCompanyContext(@Body('companyId') companyId: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.auditCompanyContext(user.id, companyId);
  }

  @RequirePermissions('audit-logs.view')
  @Get('audit-logs')
  @Roles('SUPER_ADMIN')
  listAuditLogs(@Query() query: PaginationQueryDto) {
    return this.adminService.listAuditLogs(query);
  }

  @RequirePermissions('platform-security.view')
  @Get('stats')
  @Roles('SUPER_ADMIN')
  getStats() {
    return this.adminService.getGlobalStats();
  }

  @RequirePermissions('roles.view')
  @Get('company/roles')
  @Roles('TENANT_ADMIN')
  listCompanyRoles(@CurrentUser() user: CurrentUserType) {
    return this.adminService.listRoles(this.getCompanyId(user));
  }

  @RequirePermissions('roles.manage')
  @Post('company/roles')
  @Roles('TENANT_ADMIN')
  createCompanyRole(@Body() dto: { name: string; slug: string; description?: string; permissionSlugs?: string[] }, @CurrentUser() user: CurrentUserType) {
    return this.adminService.createRole({ ...dto, companyId: this.getCompanyId(user) });
  }

  @RequirePermissions('roles.manage')
  @Patch('company/roles/:id')
  @Roles('TENANT_ADMIN')
  updateCompanyRole(@Param('id') id: string, @Body() dto: { name?: string; description?: string; permissionSlugs?: string[]; acknowledgeCriticalRemoval?: boolean }, @CurrentUser() user: CurrentUserType) {
    return this.adminService.updateRole(id, dto, user);
  }

  @RequirePermissions('roles.manage')
  @Delete('company/roles/:id')
  @Roles('TENANT_ADMIN')
  deleteCompanyRole(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.deleteRole(id, user);
  }

  @RequirePermissions('users.view')
  @Get('company/users')
  @Roles('TENANT_ADMIN')
  listCompanyUsers(@Query() query: PaginationQueryDto, @CurrentUser() user: CurrentUserType) {
    return this.adminService.listCompanyUsers(this.getCompanyId(user), query);
  }

  @RequirePermissions('users.manage')
  @Post('company/users')
  @Roles('TENANT_ADMIN')
  createCompanyUser(@Body() dto: { email: string; password: string; firstName: string; lastName: string; role?: string }, @CurrentUser() user: CurrentUserType) {
    return this.adminService.createCompanyUser(dto, this.getCompanyId(user), user);
  }

  @RequirePermissions('users.view')
  @Get('company/users/:id')
  @Roles('TENANT_ADMIN')
  getCompanyUser(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.getCompanyUser(id, this.getCompanyId(user));
  }

  @RequirePermissions('users.manage')
  @Patch('company/users/:id/role')
  @Roles('TENANT_ADMIN')
  updateCompanyUserRole(@Param('id') id: string, @Body('role') role: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.updateCompanyUserRole(id, role, this.getCompanyId(user), user);
  }

  @RequirePermissions('users.delete')
  @Delete('company/users/:id')
  @Roles('TENANT_ADMIN')
  removeCompanyUser(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.removeCompanyUser(id, this.getCompanyId(user), user);
  }

  @RequirePermissions('settings.manage')
  @Post('company/invite-code')
  @Roles('TENANT_ADMIN')
  generateCompanyInviteCode(@CurrentUser() user: CurrentUserType, @Body('expiresInDays') expiresInDays?: number) {
    return this.adminService.generateInviteCode(this.getCompanyId(user), expiresInDays);
  }

  @RequirePermissions('settings.view')
  @Get('company/settings')
  @Roles('TENANT_ADMIN')
  getCompanySettings(@CurrentUser() user: CurrentUserType) {
    return this.adminService.getCompanySettings(this.getCompanyId(user));
  }

  @RequirePermissions('settings.manage')
  @Patch('company/settings')
  @Roles('TENANT_ADMIN')
  updateCompanySettings(@Body() dto: UpdateCompanySettingsDto, @CurrentUser() user: CurrentUserType) {
    return this.adminService.updateCompanySettings(this.getCompanyId(user), dto);
  }
}
