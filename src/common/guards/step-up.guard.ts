import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STEP_UP_KEY } from '../decorators/step-up.decorator';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class StepUpGuard implements CanActivate {
  private readonly logger = new Logger(StepUpGuard.name);
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(STEP_UP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.sessionId) {
      throw new ForbiddenException({ code: 'STEP_UP_REQUIRED', message: 'Recent MFA verification is required' });
    }

    const rows = await this.prisma.query<any[]>(
      `SELECT s.mfaVerifiedAt, u.mfaEnabled
       FROM Session s JOIN User u ON u.id = s.userId
       WHERE s.id = ? AND s.userId = ? AND s.revokedAt IS NULL
       LIMIT 1`,
      [user.sessionId, user.id],
    ).catch((error) => {
      this.logger.warn(`Failed to validate step-up session for user ${user.id}: ${error?.message || error}`);
      return [];
    });
    const row = rows[0];
    if (!row?.mfaEnabled) {
      throw new ForbiddenException({ code: 'STEP_UP_REQUIRED', message: 'MFA must be enabled before this action' });
    }
    const verifiedAt = row.mfaVerifiedAt ? new Date(row.mfaVerifiedAt).getTime() : 0;
    if (Date.now() - verifiedAt > 10 * 60 * 1000) {
      throw new ForbiddenException({ code: 'STEP_UP_REQUIRED', message: 'Recent MFA verification is required' });
    }
    return true;
  }
}
