import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CustomerPortalService } from './customer-portal.service';

@Controller('customer-portal')
@UseGuards(JwtAuthGuard, TenantGuard, FeatureAccessGuard)
@RequireFeature('tickets')
export class CustomerPortalController {
  constructor(private service: CustomerPortalService) {}

  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.service.summary(user);
  }

  @Get('feedback')
  listFeedback(@CurrentUser() user: CurrentUserType) {
    return this.service.listFeedback(user);
  }

  @Post('tickets/:ticketId/message')
  addMessage(@Param('ticketId') ticketId: string, @Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.service.addCustomerMessage(ticketId, dto, user);
  }

  @Post('tickets/:ticketId/feedback')
  saveFeedback(@Param('ticketId') ticketId: string, @Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.service.saveFeedback(ticketId, dto, user);
  }
}
