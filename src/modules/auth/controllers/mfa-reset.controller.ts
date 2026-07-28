import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireStepUp } from '../../../common/decorators/step-up.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { StepUpGuard } from '../../../common/guards/step-up.guard';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { CreateMfaResetRequestDto, ReviewMfaResetRequestDto } from '../dto/mfa-reset.dto';
import { MfaResetService } from '../services/mfa-reset.service';

@Controller('auth/mfa-reset-requests')
export class MfaResetController {
  constructor(private readonly resets: MfaResetService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  @Post()
  create(@Body() dto: CreateMfaResetRequestDto) {
    return this.resets.create(dto);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('settings.manage')
  @Get('admin')
  list(@CurrentUser() user: CurrentUserType) {
    return this.resets.list(user);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard, StepUpGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('settings.manage')
  @RequireStepUp()
  @Patch('admin/:id')
  review(@Param('id') id: string, @Body() dto: ReviewMfaResetRequestDto, @CurrentUser() user: CurrentUserType) {
    return this.resets.review(id, dto, user);
  }
}
