import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CustomerPortalService } from './customer-portal.service';
import { AuthorizationExempt } from '../../common/decorators/authorization-exempt.decorator';

@Controller('customer-portal')
@UseGuards(JwtAuthGuard, TenantGuard, FeatureAccessGuard)
@RequireFeature('tickets')
export class CustomerPortalController {
  constructor(private service: CustomerPortalService) {}

  @AuthorizationExempt('Customer portal service enforces requester ownership and tenant scope', 'customer-experience', '2026-09-30')
  @Get('summary')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.service.summary(user);
  }

  @AuthorizationExempt('Customer portal overview is restricted to requester-owned tickets and related records', 'customer-experience', '2026-09-30')
  @Get('overview')
  overview(@CurrentUser() user: CurrentUserType) {
    return this.service.overview(user);
  }

  @AuthorizationExempt('Customer portal service enforces requester ownership and tenant scope', 'customer-experience', '2026-09-30')
  @Get('feedback')
  listFeedback(@CurrentUser() user: CurrentUserType) {
    return this.service.listFeedback(user);
  }

  @AuthorizationExempt('Customer portal service enforces requester ownership and tenant scope', 'customer-experience', '2026-09-30')
  @Post('tickets/:ticketId/message')
  addMessage(@Param('ticketId') ticketId: string, @Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.service.addCustomerMessage(ticketId, dto, user);
  }

  @AuthorizationExempt('Customer portal service enforces requester ownership and tenant scope', 'customer-experience', '2026-09-30')
  @Post('tickets/:ticketId/feedback')
  saveFeedback(@Param('ticketId') ticketId: string, @Body() dto: any, @CurrentUser() user: CurrentUserType) {
    return this.service.saveFeedback(ticketId, dto, user);
  }
}
