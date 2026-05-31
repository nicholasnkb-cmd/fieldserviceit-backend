import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { UsersService } from '../services/users.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, TenantGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: CurrentUserType) {
    return this.usersService.findById(user.id);
  }

  @Patch('me')
  updateMe(@Body() dto: UpdateProfileDto, @CurrentUser() user: CurrentUserType) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Post('me/change-password')
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() user: CurrentUserType) {
    return this.usersService.changePassword(user.id, dto.oldPassword, dto.newPassword);
  }

  @Get('me/features')
  getEffectiveFeatures(@CurrentUser() user: CurrentUserType) {
    return this.usersService.getEffectiveFeatures(user.id);
  }

  @Get('me/favorites')
  listFavorites(@CurrentUser() user: CurrentUserType) {
    return this.usersService.listFavorites(user.id);
  }

  @Post('me/favorites')
  addFavorite(@Body() dto: { label?: string; path?: string }, @CurrentUser() user: CurrentUserType) {
    return this.usersService.addFavorite(user.id, dto);
  }

  @Delete('me/favorites')
  removeFavorite(@Body() dto: { path: string }, @CurrentUser() user: CurrentUserType) {
    return this.usersService.removeFavorite(user.id, dto.path);
  }

  @Post()
  create(@Body() dto: { email: string; password: string; firstName: string; lastName: string; role?: string }, @CurrentUser() user: CurrentUserType) {
    return this.usersService.create(dto as any, user.companyId);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: CurrentUserType) {
    return this.usersService.findAll(user.companyId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.usersService.findOne(id, user.companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Record<string, any>, @CurrentUser() user: CurrentUserType) {
    return this.usersService.update(id, dto, user.companyId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.usersService.remove(id, user.companyId);
  }
}
