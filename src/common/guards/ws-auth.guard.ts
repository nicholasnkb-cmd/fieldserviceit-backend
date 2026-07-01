import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token || client.handshake?.query?.token;
    if (!token) return false;
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, userType: true, companyId: true, isActive: true, authVersion: true, deletedAt: true },
      });
      if (!user || !user.isActive || user.deletedAt || Number(payload.av || 0) !== Number(user.authVersion || 0)) return false;
      if (payload.sid) {
        const sessions = await this.prisma.query<any[]>(
          `SELECT id FROM Session WHERE id = ? AND userId = ? AND revokedAt IS NULL AND expiresAt > NOW(3) LIMIT 1`,
          [payload.sid, user.id],
        );
        if (!sessions.length) return false;
      }
      client.data.user = { ...payload, ...user, id: user.id };
      return true;
    } catch {
      return false;
    }
  }
}
