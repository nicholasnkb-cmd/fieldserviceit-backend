import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from '../../modules/audit-log/audit-log.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, path, user, params, companyId } = request;

    const resourceType = path.split('/')[2];

    return next.handle().pipe(
      tap((result) => {
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && user) {
          const auditCompanyId = companyId || user.companyId || result?.companyId || result?.data?.companyId;
          if (!auditCompanyId) return;
          this.auditLogService.create({
            companyId: auditCompanyId,
            actorId: user.id,
            action: `${method}.${resourceType}`,
            resourceType,
            resourceId: params?.id || result?.id || result?.data?.id || 'unknown',
            ip: request.ip,
            userAgent: request.headers['user-agent'],
          }).catch(() => undefined);
        }
      }),
    );
  }
}
