import { Controller, Get, Patch, Post, Put, Param, Query, Body, UseGuards, Headers, UnauthorizedException } from '@nestjs/common';
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

  @Public()
  @Post('email/bounces')
  recordBounce(@Body() body: any, @Headers('x-api-key') apiKey?: string) {
    const expectedKey = process.env.EMAIL_WEBHOOK_API_KEY;
    if (!expectedKey || apiKey !== expectedKey) throw new UnauthorizedException('Invalid API key');
    return this.emailDeliveryService.recordBounce(body);
  }
}
