import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BusinessOnly } from '../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { SecurityCenterService } from './security-center.service';

@Controller('security-center')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard)
@BusinessOnly()
@RequireFeature('auditLogs')
export class SecurityCenterController {
  constructor(private service: SecurityCenterService) {}

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.service.summary(user);
  }

  @Get('findings')
  listFindings(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listFindings(user, query);
  }

  @Post('findings')
  createFinding(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createFinding(user, dto);
  }

  @Patch('findings/:id')
  updateFinding(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateFinding(user, id, dto);
  }

  @Get('events')
  listEvents(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listEvents(user, query);
  }

  @Get('access-review')
  accessReview(@CurrentUser() user: CurrentUserType) {
    return this.service.accessReview(user);
  }

  @Get('device-posture')
  devicePosture(@CurrentUser() user: CurrentUserType) {
    return this.service.devicePosture(user);
  }
}
