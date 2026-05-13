import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // Super admins bypass tenant isolation entirely
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    // Public users have no company context - skip tenant isolation
    if (user.userType === 'PUBLIC') {
      return true;
    }

    // Business users must have a company context
    if (!user.companyId) {
      throw new ForbiddenException('No company context available');
    }

    const paramCompanyId = request.params?.companyId || request.body?.companyId;

    if (paramCompanyId && paramCompanyId !== user.companyId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    request.companyId = user.companyId;
    return true;
  }
}
