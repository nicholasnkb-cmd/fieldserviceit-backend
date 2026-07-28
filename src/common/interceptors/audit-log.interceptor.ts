import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogService } from '../../modules/audit-log/audit-log.service';
import { StructuredLogger } from '../logger/structured-logger.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(private auditLogService: AuditLogService, private readonly structuredLogger: StructuredLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, path, user, params, companyId } = request;

    const resourceType = path.split('/')[2];

    return next.handle().pipe(
      tap((result) => {
        if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && user) {
          const auditCompanyId = companyId || user.companyId || result?.companyId || result?.data?.companyId;
          if (auditCompanyId) {
            this.auditLogService.create({
              companyId: auditCompanyId,
              actorId: user.id,
              action: `${method}.${resourceType}`,
              resourceType,
              resourceId: params?.id || result?.id || result?.data?.id || 'unknown',
              ip: request.ip,
              userAgent: request.headers['user-agent'],
            }).catch((error) => {
              this.logger.warn(JSON.stringify({
                event: 'audit_log_write_failed',
                method,
                path,
                actorId: user.id,
                companyId: auditCompanyId,
                error: error?.message || String(error),
              }));
            });
          }
          if (/\/(admin|platform-security|privacy-requests|mfa-reset-requests|security-center)(\/|$)/.test(path)) {
            this.structuredLogger.warn('Privileged mutation completed', 'SecurityOperations', request, {
              event: 'privileged_mutation',
              action: `${method}.${resourceType}`,
              resourceId: params?.id || result?.id || result?.data?.id || 'unknown',
            });
          }
        }
      }),
    );
  }
}
