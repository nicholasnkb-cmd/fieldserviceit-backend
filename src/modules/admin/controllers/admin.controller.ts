import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdminService } from '../services/admin.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, BusinessOnlyGuard, RolesGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('permissions')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  listPermissions() {
    return this.adminService.listPermissions();
  }

  @Get('plans')
  @Roles('SUPER_ADMIN')
  listPlans() {
    return this.adminService.listPlans();
  }

  @Patch('plans/:id')
  @Roles('SUPER_ADMIN')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.adminService.updatePlan(id, dto);
  }

  @Get('system-readiness')
  @Roles('SUPER_ADMIN')
  getSystemReadiness() {
    return this.adminService.getSystemReadiness();
  }

  @Get('function-controls')
  @Roles('SUPER_ADMIN')
  listFunctionControls() {
    return this.adminService.listFunctionControls();
  }

  @Get('roles')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  listRoles(@CurrentUser() user: CurrentUserType) {
    const companyId = user.role === 'SUPER_ADMIN' ? undefined : user.companyId;
    return this.adminService.listRoles(companyId);
  }

  @Get('roles/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  getRole(@Param('id') id: string) {
    return this.adminService.getRole(id);
  }

  @Post('roles')
  @Roles('SUPER_ADMIN')
  createRole(@Body() dto: { name: string; slug: string; description?: string; companyId?: string; permissionSlugs?: string[] }) {
    return this.adminService.createRole(dto);
  }

  @Patch('roles/:id')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  updateRole(@Param('id') id: string, @Body() dto: { name?: string; description?: string; permissionSlugs?: string[] }) {
    return this.adminService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @Roles('SUPER_ADMIN')
  deleteRole(@Param('id') id: string) {
    return this.adminService.deleteRole(id);
  }

  @Post('users/:userId/roles/:roleId')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  assignUserRole(@Param('userId') userId: string, @Param('roleId') roleId: string) {
    return this.adminService.assignUserRole(userId, roleId);
  }

  @Delete('users/:userId/roles/:roleId')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  removeUserRole(@Param('userId') userId: string, @Param('roleId') roleId: string) {
    return this.adminService.removeUserRole(userId, roleId);
  }

  @Get('users/:id/roles')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  getUserRoles(@Param('id') id: string) {
    return this.adminService.getUserRoles(id);
  }

  @Get('roles-legacy')
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  listRolesLegacy() {
    return this.adminService.listRolesLegacy();
  }

  @Get('users')
  @Roles('SUPER_ADMIN')
  listUsers(@Query() query: PaginationQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Get('tickets')
  @Roles('SUPER_ADMIN')
  listTickets(@Query() query: PaginationQueryDto & { status?: string; priority?: string }) {
    return this.adminService.listTickets(query);
  }

  @Get('users/:id')
  @Roles('SUPER_ADMIN')
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Post('users')
  @Roles('SUPER_ADMIN')
  createUser(@Body() dto: { email: string; password: string; firstName: string; lastName: string; role?: string; companyId: string }) {
    return this.adminService.createUser(dto);
  }

  @Patch('users/:id/role')
  @Roles('SUPER_ADMIN')
  updateUserRole(@Param('id') id: string, @Body('role') role: string) {
    return this.adminService.updateUserRole(id, role);
  }

  @Patch('users/:id')
  @Roles('SUPER_ADMIN')
  updateUser(@Param('id') id: string, @Body() dto: Record<string, any>) {
    return this.adminService.updateUser(id, dto);
  }

  @Get('users/:id/feature-controls')
  @Roles('SUPER_ADMIN')
  getUserFeatureControls(@Param('id') id: string) {
    return this.adminService.getUserFeatureControls(id);
  }

  @Patch('users/:id/feature-controls')
  @Roles('SUPER_ADMIN')
  updateUserFeatureControls(@Param('id') id: string, @Body() dto: Record<string, any>) {
    return this.adminService.updateUserFeatureControls(id, dto);
  }

  @Delete('users/:id')
  @Roles('SUPER_ADMIN')
  removeUser(@Param('id') id: string) {
    return this.adminService.removeUser(id);
  }

  @Get('companies')
  @Roles('SUPER_ADMIN')
  listCompanies(@Query() query: PaginationQueryDto) {
    return this.adminService.listCompanies(query);
  }

  @Post('companies')
  @Roles('SUPER_ADMIN')
  createCompany(@Body() dto: { name: string; slug: string; domain?: string }) {
    return this.adminService.createCompany(dto);
  }

  @Get('companies/:id/settings')
  @Roles('SUPER_ADMIN')
  getManagedCompanySettings(@Param('id') id: string) {
    return this.adminService.getCompanySettings(id);
  }

  @Patch('companies/:id/settings')
  @Roles('SUPER_ADMIN')
  updateManagedCompanySettings(@Param('id') id: string, @Body() dto: Record<string, any>) {
    return this.adminService.updateCompanySettings(id, dto);
  }

  @Patch('companies/:id/feature-overrides')
  @Roles('SUPER_ADMIN')
  updateCompanyFeatureOverrides(@Param('id') id: string, @Body() dto: Record<string, any>) {
    return this.adminService.updateCompanyFeatureOverrides(id, dto);
  }

  @Get('companies/:id/feature-controls')
  @Roles('SUPER_ADMIN')
  getCompanyFeatureControls(@Param('id') id: string) {
    return this.adminService.getCompanyFeatureControls(id);
  }

  @Patch('companies/:id')
  @Roles('SUPER_ADMIN')
  updateCompany(@Param('id') id: string, @Body() dto: Record<string, any>) {
    return this.adminService.updateCompany(id, dto);
  }

  @Delete('companies/:id')
  @Roles('SUPER_ADMIN')
  removeCompany(@Param('id') id: string) {
    return this.adminService.removeCompany(id);
  }

  @Post('companies/:id/invite-code')
  @Roles('SUPER_ADMIN')
  generateInviteCode(@Param('id') id: string, @Body('expiresInDays') expiresInDays?: number) {
    return this.adminService.generateInviteCode(id, expiresInDays);
  }

  @Post('company-context/audit')
  @Roles('SUPER_ADMIN')
  auditCompanyContext(@Body('companyId') companyId: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.auditCompanyContext(user.id, companyId);
  }

  @Get('audit-logs')
  @Roles('SUPER_ADMIN')
  listAuditLogs(@Query() query: PaginationQueryDto) {
    return this.adminService.listAuditLogs(query);
  }

  @Get('stats')
  @Roles('SUPER_ADMIN')
  getStats() {
    return this.adminService.getGlobalStats();
  }

  @Get('company/roles')
  @Roles('TENANT_ADMIN')
  listCompanyRoles(@CurrentUser() user: CurrentUserType) {
    return this.adminService.listRoles(user.companyId);
  }

  @Post('company/roles')
  @Roles('TENANT_ADMIN')
  createCompanyRole(@Body() dto: { name: string; slug: string; description?: string; permissionSlugs?: string[] }, @CurrentUser() user: CurrentUserType) {
    return this.adminService.createRole({ ...dto, companyId: user.companyId });
  }

  @Patch('company/roles/:id')
  @Roles('TENANT_ADMIN')
  updateCompanyRole(@Param('id') id: string, @Body() dto: { name?: string; description?: string; permissionSlugs?: string[] }, @CurrentUser() user: CurrentUserType) {
    return this.adminService.updateRole(id, dto);
  }

  @Delete('company/roles/:id')
  @Roles('TENANT_ADMIN')
  deleteCompanyRole(@Param('id') id: string) {
    return this.adminService.deleteRole(id);
  }

  @Get('company/users')
  @Roles('TENANT_ADMIN')
  listCompanyUsers(@Query() query: PaginationQueryDto, @CurrentUser() user: CurrentUserType) {
    return this.adminService.listCompanyUsers(user.companyId, query);
  }

  @Post('company/users')
  @Roles('TENANT_ADMIN')
  createCompanyUser(@Body() dto: { email: string; password: string; firstName: string; lastName: string; role?: string }, @CurrentUser() user: CurrentUserType) {
    return this.adminService.createCompanyUser(dto, user.companyId);
  }

  @Get('company/users/:id')
  @Roles('TENANT_ADMIN')
  getCompanyUser(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.getCompanyUser(id, user.companyId);
  }

  @Patch('company/users/:id/role')
  @Roles('TENANT_ADMIN')
  updateCompanyUserRole(@Param('id') id: string, @Body('role') role: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.updateCompanyUserRole(id, role, user.companyId);
  }

  @Delete('company/users/:id')
  @Roles('TENANT_ADMIN')
  removeCompanyUser(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.adminService.removeCompanyUser(id, user.companyId);
  }

  @Post('company/invite-code')
  @Roles('TENANT_ADMIN')
  generateCompanyInviteCode(@CurrentUser() user: CurrentUserType, @Body('expiresInDays') expiresInDays?: number) {
    return this.adminService.generateInviteCode(user.companyId, expiresInDays);
  }

  @Get('company/settings')
  @Roles('TENANT_ADMIN')
  getCompanySettings(@CurrentUser() user: CurrentUserType) {
    return this.adminService.getCompanySettings(user.companyId);
  }

  @Patch('company/settings')
  @Roles('TENANT_ADMIN')
  updateCompanySettings(@Body() dto: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    return this.adminService.updateCompanySettings(user.companyId, dto);
  }
}
