import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.role === 'SUPER_ADMIN') {
      const companyContext = this.getCompanyContextHeader(request.headers);
      if (!companyContext) {
        request.companyId = null;
        return true;
      }

      const company = await this.prisma.company.findFirst({
        where: { id: companyContext, deletedAt: null, isActive: true },
        select: { id: true },
      });

      if (!company) {
        throw new ForbiddenException('Selected company context is not available');
      }

      request.companyId = company.id;
      request.user = {
        ...user,
        companyId: company.id,
        effectiveCompanyId: company.id,
        isImpersonatingCompany: true,
      };
      return true;
    }

    // Public users have no company context
    if (user.userType === 'PUBLIC') {
      request.companyId = null;
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

  private getCompanyContextHeader(headers: Record<string, string | string[] | undefined>): string | null {
    const value = headers['x-company-context'];
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
  }
}
