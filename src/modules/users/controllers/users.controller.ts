import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { AuthorizationExempt } from '../../../common/decorators/authorization-exempt.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';

@Controller('users')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @AuthorizationExempt('Authenticated users manage only their own profile, password, features, and favorites', 'identity-team', '2026-09-30')
  @Get('me')
  getMe(@CurrentUser() user: CurrentUserType) {
    return this.usersService.findById(user.id);
  }

  @AuthorizationExempt('Authenticated users manage only their own profile, password, features, and favorites', 'identity-team', '2026-09-30')
  @Patch('me')
  updateMe(@Body() dto: UpdateProfileDto, @CurrentUser() user: CurrentUserType) {
    return this.usersService.updateMe(user.id, dto);
  }

  @AuthorizationExempt('Authenticated users manage only their own profile, password, features, and favorites', 'identity-team', '2026-09-30')
  @Post('me/change-password')
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: CurrentUserType) {
    return this.usersService.changePassword(user.id, dto.oldPassword, dto.newPassword);
  }

  @AuthorizationExempt('Authenticated users manage only their own profile, password, features, and favorites', 'identity-team', '2026-09-30')
  @Get('me/features')
  getEffectiveFeatures(@CurrentUser() user: CurrentUserType) {
    return this.usersService.getEffectiveFeatures(user.id);
  }

  @AuthorizationExempt('Authenticated users manage only their own profile, password, features, and favorites', 'identity-team', '2026-09-30')
  @Get('me/favorites')
  listFavorites(@CurrentUser() user: CurrentUserType) {
    return this.usersService.listFavorites(user.id);
  }

  @AuthorizationExempt('Authenticated users manage only their own profile, password, features, and favorites', 'identity-team', '2026-09-30')
  @Post('me/favorites')
  addFavorite(@Body() dto: { label?: string; path?: string }, @CurrentUser() user: CurrentUserType) {
    return this.usersService.addFavorite(user.id, dto);
  }

  @AuthorizationExempt('Authenticated users manage only their own profile, password, features, and favorites', 'identity-team', '2026-09-30')
  @Delete('me/favorites')
  removeFavorite(@Body() dto: { path: string }, @CurrentUser() user: CurrentUserType) {
    return this.usersService.removeFavorite(user.id, dto.path);
  }

  @RequirePermissions('users.create')
  @Post()
  create(@Body() dto: { email: string; password: string; firstName: string; lastName: string; role?: string }, @CurrentUser() user: CurrentUserType) {
    return this.usersService.create(dto as any, user.companyId);
  }

  @RequirePermissions('users.view')
  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: CurrentUserType) {
    return this.usersService.findAll(user.companyId, query, user);
  }

  @RequirePermissions('users.view')
  @Get('options')
  listOptions(@Query('roles') roles: string, @CurrentUser() user: CurrentUserType) {
    const companyId = user.effectiveCompanyId || user.companyId;
    if (!companyId) throw new ForbiddenException('Select a company context to list users');
    return this.usersService.listOptions(companyId, roles);
  }

  @RequirePermissions('users.view')
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.usersService.findOne(id, user.companyId);
  }

  @RequirePermissions('users.manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    return this.usersService.update(id, dto, user.companyId);
  }

  @RequirePermissions('users.delete')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.usersService.remove(id, user.companyId);
  }
}
