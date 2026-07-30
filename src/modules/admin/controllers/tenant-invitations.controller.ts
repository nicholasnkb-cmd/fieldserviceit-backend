import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CreateTenantInvitationDto, AcceptTenantInvitationDto } from '../dto/tenant-invitation.dto';
import { TenantInvitationsService } from '../services/tenant-invitations.service';

@Controller('admin/company/invitations')
@UseGuards(JwtAuthGuard, BusinessOnlyGuard, RolesGuard, PermissionsGuard)
@Roles('TENANT_ADMIN')
export class CompanyInvitationsController {
  constructor(private readonly invitations: TenantInvitationsService) {}

  @Get()
  @RequirePermissions('users.view')
  list(@CurrentUser() user: CurrentUserType) {
    return this.invitations.list(this.companyId(user));
  }

  @Post()
  @RequirePermissions('users.create')
  create(@CurrentUser() user: CurrentUserType, @Body() dto: CreateTenantInvitationDto) {
    return this.invitations.create(this.companyId(user), user, dto);
  }

  @Delete(':id')
  @RequirePermissions('users.manage')
  revoke(@CurrentUser() user: CurrentUserType, @Param('id') id: string) {
    return this.invitations.revoke(this.companyId(user), user, id);
  }

  private companyId(user: CurrentUserType) {
    return user.effectiveCompanyId || user.companyId!;
  }
}

@Controller('auth/invitations')
export class InvitationAcceptanceController {
  constructor(private readonly invitations: TenantInvitationsService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get(':token')
  inspect(@Param('token') token: string) {
    return this.invitations.inspect(token);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 600000 } })
  @Post(':token/accept')
  accept(@Param('token') token: string, @Body() dto: AcceptTenantInvitationDto, @Req() req: Request) {
    return this.invitations.accept(token, dto, {
      ipAddress: req.ip,
      userAgent: String(req.headers['user-agent'] || ''),
    });
  }
}
