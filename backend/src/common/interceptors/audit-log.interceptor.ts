import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, path, user, params, companyId } = request;

    const resourceType = path.split('/')[2];

    return next.handle().pipe(
      tap(() => {
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && user) {
          const auditCompanyId = companyId || user.companyId;
          if (!auditCompanyId) return;
          this.prisma.auditLog.create({
            data: {
              companyId: auditCompanyId,
              actorId: user.id,
              action: `${method}.${resourceType}`,
              resourceType,
              resourceId: params?.id,
              ip: request.ip,
              userAgent: request.headers['user-agent'],
            },
          }).catch(() => {});
        }
      }),
    );
  }
}
