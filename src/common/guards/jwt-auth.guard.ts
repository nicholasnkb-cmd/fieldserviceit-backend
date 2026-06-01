import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      const request = context.switchToHttp().getRequest();
      if (!this.hasAuthCredentials(request)) return true;

      try {
        return await (super.canActivate(context) as boolean | Promise<boolean>);
      } catch {
        return true;
      }
    }
    return await (super.canActivate(context) as boolean | Promise<boolean>);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }

  private hasAuthCredentials(request: any): boolean {
    const authorization = request?.headers?.authorization;
    const cookie = request?.headers?.cookie;
    return Boolean(
      (typeof authorization === 'string' && authorization.trim().length > 0) ||
      (typeof cookie === 'string' && cookie.includes('fsit_access='))
    );
  }
}
