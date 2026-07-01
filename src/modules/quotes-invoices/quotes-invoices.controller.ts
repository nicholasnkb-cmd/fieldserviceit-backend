import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { BusinessOnly } from '../../common/decorators/business-only.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../../common/decorators/feature.decorator';
import { CurrentUser as CurrentUserType } from '../../common/types';
import { BusinessOnlyGuard } from '../../common/guards/business-only.guard';
import { FeatureAccessGuard } from '../../common/guards/feature-access.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { QuotesInvoicesService } from './quotes-invoices.service';

@Controller('quotes-invoices')
@UseGuards(JwtAuthGuard, TenantGuard, BusinessOnlyGuard, FeatureAccessGuard, PermissionsGuard)
@BusinessOnly()
@RequireFeature('billing')
export class QuotesInvoicesController {
  constructor(private service: QuotesInvoicesService) {}

  @Get('summary')
  @RequirePermissions('billing.view')
  summary(@CurrentUser() user: CurrentUserType) {
    return this.service.summary(user);
  }

  @Get('quotes')
  @RequirePermissions('quotes.view')
  listQuotes(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listQuotes(user, query);
  }

  @Post('quotes')
  @RequirePermissions('quotes.create')
  createQuote(@CurrentUser() user: CurrentUserType, @Body() dto: any) {
    return this.service.createQuote(user, dto);
  }

  @Patch('quotes/:id')
  @RequirePermissions('quotes.edit')
  updateQuote(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateQuote(user, id, dto);
  }

  @Post('quotes/:id/convert')
  @RequirePermissions('quotes.approve', 'invoices.create')
  convertQuote(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.convertQuoteToInvoice(user, id, dto);
  }

  @Get('invoices')
  @RequirePermissions('invoices.view')
  listInvoices(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.service.listInvoices(user, query);
  }

  @Patch('invoices/:id')
  @RequirePermissions('invoices.edit')
  updateInvoice(@CurrentUser() user: CurrentUserType, @Param('id') id: string, @Body() dto: any) {
    return this.service.updateInvoice(user, id, dto);
  }
}
