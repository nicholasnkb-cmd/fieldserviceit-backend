import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsageService } from '../services/usage.service';

export const CHECK_TICKET_LIMIT = 'checkTicketLimit';
export const CHECK_USER_LIMIT = 'checkUserLimit';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private usageService: UsageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const checkTicket = this.reflector.getAllAndOverride<boolean>(CHECK_TICKET_LIMIT, [context.getHandler(), context.getClass()]);
    const checkUser = this.reflector.getAllAndOverride<boolean>(CHECK_USER_LIMIT, [context.getHandler(), context.getClass()]);

    if (!checkTicket && !checkUser) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.companyId) return true;

    if (checkTicket) {
      await this.usageService.checkTicketLimit(user.companyId);
    }
    if (checkUser) {
      await this.usageService.checkUserLimit(user.companyId);
    }
    return true;
  }
}
