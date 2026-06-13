import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MonitoringAccessGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user && ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role)) return true;

    const configuredKey = this.config.get<string>('MONITORING_API_KEY');
    const suppliedKey = request.headers?.['x-monitoring-key'];
    if (configuredKey && typeof suppliedKey === 'string' && suppliedKey === configuredKey) return true;

    throw new ForbiddenException('Monitoring access required');
  }
}
