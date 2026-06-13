import { BadRequestException, Controller, Post, Body, Headers, Req, UseGuards, Get, RawBodyRequest, HttpCode, Param } from '@nestjs/common';
import { BillingService } from '../services/billing.service';
import { PlansService } from '../services/plans.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RequireFeature } from '../../../common/decorators/feature.decorator';
import { FeatureAccessGuard } from '../../../common/guards/feature-access.guard';
import { CreateCheckoutDto } from '../dto/create-checkout.dto';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { AuthorizationExempt } from '../../../common/decorators/authorization-exempt.decorator';

@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
    private plansService: PlansService,
  ) {}

  @UseGuards(JwtAuthGuard, TenantGuard, FeatureAccessGuard, PermissionsGuard, PermissionsGuard)
  @RequireFeature('billing')
  @RequirePermissions('billing.view')
  @Get('current-plan')
  async getCurrentPlan(@CurrentUser() user: CurrentUserType) {
    const companyId = user.companyId;
    if (!companyId) return { plan: null };
    return this.plansService.getCompanyPlan(companyId);
  }

  @UseGuards(JwtAuthGuard, TenantGuard, FeatureAccessGuard, PermissionsGuard)
  @RequireFeature('billing')
  @RequirePermissions('billing.manage')
  @Post('checkout')
  async createCheckout(
    @Body() body: CreateCheckoutDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const companyId = user.companyId;
    if (!companyId) throw new BadRequestException('No company assigned');
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.billingService.createCheckoutSession(
      companyId,
      body.planId,
      body.successUrl || `${baseUrl}/billing?success=1`,
      body.cancelUrl || `${baseUrl}/billing?canceled=1`,
      {
        provider: body.provider,
        interval: body.interval,
        seats: body.seats,
        useTrial: body.useTrial,
      },
    );
  }

  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermissions('billing.view')
  @Get('summary')
  async getSummary(@CurrentUser() user: CurrentUserType) {
    if (!user.companyId) return { subscription: null };
    return this.maskBilling(await this.billingService.getBillingSummary(user.companyId), user);
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions('billing.view')
  @Get('providers')
  getProviders() {
    return this.billingService.getProviderReadiness();
  }

  @UseGuards(JwtAuthGuard, TenantGuard, FeatureAccessGuard, PermissionsGuard)
  @RequireFeature('billing')
  @RequirePermissions('billing.view')
  @Get('invoices')
  async getInvoices(@CurrentUser() user: CurrentUserType) {
    const companyId = user.companyId;
    if (!companyId) return [];
    return this.maskBilling(await this.billingService.getInvoices(companyId), user);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('billing.view')
  @Post('portal')
  async createPortal(@CurrentUser() user: CurrentUserType) {
    const companyId = user.companyId;
    if (!companyId) throw new BadRequestException('No company assigned');
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.billingService.createPortalSession(companyId, `${baseUrl}/billing`);
  }

  @Post('webhook')
  @HttpCode(200)
  async stripeWebhook(@Req() req: RawBodyRequest<any>, @Headers() headers: Record<string, string | string[] | undefined>) {
    return this.billingService.handleWebhook('STRIPE', req.rawBody || req.body, headers);
  }

  @Post('webhook/:provider')
  @HttpCode(200)
  async providerWebhook(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<any>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.billingService.handleWebhook(provider, req.rawBody || req.body, headers);
  }

  private maskBilling(data: any, user: CurrentUserType) {
    if (user.role === 'SUPER_ADMIN' || user.permissionSlugs?.includes('billing.sensitive.view')) return data;
    const sensitive = new Set(['amount', 'subtotal', 'total', 'amountDue', 'amountPaid', 'amountRemaining', 'customerEmail', 'paymentMethod', 'last4', 'cardBrand']);
    const mask = (value: any): any => {
      if (Array.isArray(value)) return value.map(mask);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sensitive.has(key) ? 'restricted' : mask(entry)]));
    };
    return mask(data);
  }
}
