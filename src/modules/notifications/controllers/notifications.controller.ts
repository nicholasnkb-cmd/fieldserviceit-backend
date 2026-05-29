import { Controller, Get, Patch, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { NotificationsService } from '../services/notifications.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CurrentUser as CurrentUserType } from '../../../common/types';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

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
}
