import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token || client.handshake?.query?.token;
    if (!token) return false;
    try {
      const payload = this.jwtService.verify(token);
      client.data.user = { ...payload, id: payload.sub };
      return true;
    } catch {
      return false;
    }
  }
}
