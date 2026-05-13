import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BUSINESS_ONLY_KEY } from '../decorators/business-only.decorator';

@Injectable()
export class BusinessOnlyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isBusinessOnly = this.reflector.getAllAndOverride<boolean>(BUSINESS_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isBusinessOnly) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.userType !== 'BUSINESS') {
      throw new ForbiddenException('This feature is only available for business accounts');
    }

    return true;
  }
}
