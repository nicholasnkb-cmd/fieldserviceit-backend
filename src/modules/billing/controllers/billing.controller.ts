import { Controller, Post, Body, Headers, Req, UseGuards, Get, RawBodyRequest, HttpCode } from '@nestjs/common';
import { BillingService } from '../services/billing.service';
import { PlansService } from '../services/plans.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';

@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
    private plansService: PlansService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('current-plan')
  async getCurrentPlan(@CurrentUser() user: CurrentUserType) {
    const companyId = user.companyId;
    if (!companyId) return { plan: null };
    return this.plansService.getCompanyPlan(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  async createCheckout(
    @Body() body: { planId: string; successUrl?: string; cancelUrl?: string },
    @CurrentUser() user: CurrentUserType,
  ) {
    const companyId = user.companyId;
    if (!companyId) throw new Error('No company assigned');
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.billingService.createCheckoutSession(
      companyId,
      body.planId,
      body.successUrl || `${baseUrl}/billing?success=1`,
      body.cancelUrl || `${baseUrl}/billing?canceled=1`,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('invoices')
  async getInvoices(@CurrentUser() user: CurrentUserType) {
    const companyId = user.companyId;
    if (!companyId) return [];
    return this.billingService.getInvoices(companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('portal')
  async createPortal(@CurrentUser() user: CurrentUserType) {
    const companyId = user.companyId;
    if (!companyId) throw new Error('No company assigned');
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.billingService.createPortalSession(companyId, `${baseUrl}/billing`);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<any>, @Headers('stripe-signature') signature: string) {
    return this.billingService.handleWebhook(req.rawBody, signature);
  }
}
