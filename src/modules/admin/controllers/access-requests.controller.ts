import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BusinessOnlyGuard } from '../../../common/guards/business-only.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { AccessGovernanceService } from '../services/access-governance.service';

@Controller('access-requests')
@UseGuards(JwtAuthGuard, BusinessOnlyGuard, PermissionsGuard)
export class AccessRequestsController {
  constructor(private accessGovernance: AccessGovernanceService) {}

  @Get('mine')
  @RequirePermissions('access-requests.create')
  listMine(@CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.listMyAccessRequests(user);
  }

  @Post()
  @RequirePermissions('access-requests.create')
  create(@Body() body: any, @CurrentUser() user: CurrentUserType) {
    return this.accessGovernance.createAccessRequest(body, user);
  }
}
