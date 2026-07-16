import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const impersonationId = this.getHeader(request.headers, 'x-impersonation-session');
    if (impersonationId && ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role)) {
      const rows = await this.prisma.query<any[]>(
        `SELECT ims.id, ims.actorId, ims.targetUserId, ims.expiresAt,
                t.id as targetId, t.email, t.role, t.userType, t.companyId, t.isActive,
                t.authVersion, t.department, t.location
         FROM ImpersonationSession ims JOIN User t ON t.id = ims.targetUserId
         WHERE ims.id = ? AND ims.actorId = ? AND ims.endedAt IS NULL
           AND ims.expiresAt > NOW(3) AND t.isActive = 1 AND t.deletedAt IS NULL
         LIMIT 1`,
        [impersonationId, user.id],
      ).catch((error) => {
        this.logger.warn(`Failed to validate impersonation session ${impersonationId}: ${error?.message || error}`);
        return [];
      });
      const session = rows[0];
      if (!session) throw new ForbiddenException('Impersonation session is invalid or expired');
      request.user = {
        id: session.targetId,
        email: session.email,
        role: session.role,
        userType: session.userType,
        companyId: session.companyId,
        isActive: Boolean(session.isActive),
        authVersion: session.authVersion,
        department: session.department,
        location: session.location,
        isImpersonatingUser: true,
        impersonationSessionId: session.id,
        impersonationActorId: user.id,
        impersonationActorEmail: user.email,
      };
    }

    const effectiveUser = request.user;

    if (effectiveUser.role === 'SUPER_ADMIN' || effectiveUser.role === 'GLOBAL_TECH') {
      const companyContext = this.getCompanyContextHeader(request.headers);
      if (effectiveUser.role === 'GLOBAL_TECH') {
        request.companyId = null;
        return true;
      }

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
        ...effectiveUser,
        companyId: company.id,
        effectiveCompanyId: company.id,
        isImpersonatingCompany: true,
      };
      return true;
    }

    // Public users have no company context
    if (effectiveUser.userType === 'PUBLIC') {
      request.companyId = null;
      return true;
    }

    // Business users must have a company context
    if (!effectiveUser.companyId) {
      throw new ForbiddenException('No company context available');
    }

    const paramCompanyId = request.params?.companyId || request.body?.companyId;

    if (paramCompanyId && paramCompanyId !== effectiveUser.companyId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    request.companyId = effectiveUser.companyId;
    return true;
  }

  private getCompanyContextHeader(headers: Record<string, string | string[] | undefined>): string | null {
    return this.getHeader(headers, 'x-company-context');
  }

  private getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | null {
    const value = headers[name];
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
  }
}
