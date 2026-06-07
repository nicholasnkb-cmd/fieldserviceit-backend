import { Controller, Get, Patch, Post, Put, Param, Query, Body, UseGuards, Headers, UnauthorizedException, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { NotificationsService } from '../services/notifications.service';
import { EmailDeliveryService } from '../services/email-delivery.service';
import { EmailService, SmtpConfigurationInput } from '../services/email.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';

@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard)
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private emailDeliveryService: EmailDeliveryService,
    private emailService: EmailService,
  ) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto, @CurrentUser() user: CurrentUserType) {
    return this.notificationsService.findAll(user.id, query);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.notificationsService.markAsRead(id, user.id);
  }

  @Post('read-all')
  markAllAsRead(@CurrentUser() user: CurrentUserType) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: CurrentUserType) {
    return this.notificationsService.unreadCount(user.id);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.getPreferences(user.id);
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() user: CurrentUserType, @Body() body: any) {
    return this.emailDeliveryService.updatePreferences(user.id, body);
  }

  @Post('preferences/resubscribe')
  resubscribe(@CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.resubscribe(user.id, user.email);
  }

  @Public()
  @Post('unsubscribe/:token')
  unsubscribe(@Param('token') token: string) {
    return this.emailDeliveryService.unsubscribe(token);
  }

  @Get('email/summary')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  emailSummary(@CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.summary(user);
  }

  @Get('email/config')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  emailConfig() {
    return this.emailService.getStatus();
  }

  @Put('email/config')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  updateEmailConfig(
    @Body() body: SmtpConfigurationInput,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.emailService.configure(body, user.id);
  }

  @Post('email/config/test')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  testEmailConfig() {
    return this.emailService.testConfiguration();
  }

  @Post('email/config/webhook-secret/rotate')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  rotateEmailWebhookSecret(@CurrentUser() user: CurrentUserType) {
    return this.emailService.rotateWebhookSecret(user.id);
  }

  @Get('email/queue')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  emailQueue(@CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.getQueueState(user);
  }

  @Post('email/queue/pause')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  pauseEmailQueue(@CurrentUser() user: CurrentUserType, @Body('reason') reason?: string) {
    return this.emailDeliveryService.pauseQueue(user, reason);
  }

  @Post('email/queue/resume')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  resumeEmailQueue(@CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.resumeQueue(user);
  }

  @Post('email/deliveries/retry-all')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  retryAllEmail(@CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.retryAll(user);
  }

  @Get('email/deliveries')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  emailDeliveries(@CurrentUser() user: CurrentUserType, @Query() query: any) {
    return this.emailDeliveryService.listDeliveries(user, query);
  }

  @Post('email/deliveries/:id/retry')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  retryEmail(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.retry(id, user);
  }

  @Post('email/deliveries/:id/cancel')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  cancelEmail(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.cancel(id, user);
  }

  @Post('email/deliveries/:id/resend')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  resendEmail(@Param('id') id: string, @CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.resend(id, user);
  }

  @Get('email/templates/:eventType')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  getEmailTemplate(@Param('eventType') eventType: string, @CurrentUser() user: CurrentUserType) {
    return this.emailDeliveryService.getTemplate(user, eventType);
  }

  @Put('email/templates/:eventType')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  updateEmailTemplate(
    @Param('eventType') eventType: string,
    @Body() body: any,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.emailDeliveryService.upsertTemplate(user, eventType, body);
  }

  @Post('email/templates/:eventType/preview')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN', 'TENANT_ADMIN')
  previewEmailTemplate(
    @Param('eventType') eventType: string,
    @Body() body: any,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.emailDeliveryService.previewTemplate(user, eventType, body);
  }

  @Public()
  @Get('email/track/open/:id')
  async trackEmailOpen(
    @Param('id') id: string,
    @Query('sig') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.emailDeliveryService.recordOpen(id, signature, req.ip, req.headers['user-agent']);
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.status(200).send(pixel);
  }

  @Public()
  @Get('email/track/click/:id')
  async trackEmailClick(
    @Param('id') id: string,
    @Query('url') encodedUrl: string,
    @Query('sig') signature: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const target = await this.emailDeliveryService.recordClick(
      id,
      encodedUrl,
      signature,
      req.ip,
      req.headers['user-agent'],
    );
    if (!target) return res.status(400).send('Invalid tracking link');
    return res.redirect(302, target);
  }

  @Public()
  @Post('email/events')
  async recordEmailEvent(@Body() body: any, @Headers('x-api-key') apiKey?: string) {
    if (!(await this.emailService.isWebhookSecretValid(apiKey))) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.emailDeliveryService.recordProviderEvent(body);
  }

  @Public()
  @Post('email/bounces')
  async recordBounce(@Body() body: any, @Headers('x-api-key') apiKey?: string) {
    if (!(await this.emailService.isWebhookSecretValid(apiKey))) {
      throw new UnauthorizedException('Invalid API key');
    }
    return this.emailDeliveryService.recordBounce(body);
  }
}
