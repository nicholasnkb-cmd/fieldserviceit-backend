import { Body, Controller, Get, Patch, Post, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';
import { RequireStepUp } from '../../common/decorators/step-up.decorator';
import { StepUpGuard } from '../../common/guards/step-up.guard';
import { CreatePrivacyRequestDto, PrivacyTokenDto, UpdatePrivacyRequestDto } from './dto/privacy-request.dto';
import { PrivacyRequestsService } from './privacy-requests.service';

@Controller('privacy-requests')
export class PrivacyRequestsController {
  constructor(private readonly privacyRequests: PrivacyRequestsService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  @Post()
  create(@Body() dto: CreatePrivacyRequestDto) {
    return this.privacyRequests.create(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Post('verify')
  verify(@Body() dto: PrivacyTokenDto) {
    return this.privacyRequests.verify(dto.token);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @Post('export')
  downloadExport(@Body() dto: PrivacyTokenDto) {
    return this.privacyRequests.downloadExport(dto.token);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @AuthorizationExempt('Authenticated users may inspect privacy requests associated with their own account', 'privacy-team', '2027-01-31')
  @Get('me')
  listMine(@CurrentUser() user: CurrentUserType) {
    return this.privacyRequests.listMine(user);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard, StepUpGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('settings.manage')
  @Get('admin')
  listForAdministration(@CurrentUser() user: CurrentUserType) {
    return this.privacyRequests.listForAdministration(user);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard, StepUpGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('settings.manage')
  @RequireStepUp()
  @Patch('admin/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePrivacyRequestDto, @CurrentUser() user: CurrentUserType) {
    return this.privacyRequests.update(id, dto, user);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  @RequirePermissions('settings.manage')
  @Get('admin/:id/evidence')
  evidence(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.privacyRequests.evidence(id, user);
  }
}
