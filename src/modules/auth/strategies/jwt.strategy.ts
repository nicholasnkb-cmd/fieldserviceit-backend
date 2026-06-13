import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { readAccessCookie } from '../auth-cookies';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req) => req ? readAccessCookie(req) : null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    if (payload.sid) {
      const sessions = await this.prisma.query<any[]>(
        `SELECT id, lastSeenAt FROM Session
         WHERE id = ? AND userId = ? AND revokedAt IS NULL AND expiresAt > NOW(3)
         LIMIT 1`,
        [payload.sid, payload.sub],
      );
      if (!sessions[0]) throw new UnauthorizedException();
      const lastSeen = sessions[0].lastSeenAt ? new Date(sessions[0].lastSeenAt).getTime() : 0;
      if (Date.now() - lastSeen > 5 * 60 * 1000) {
        this.prisma.execute(`UPDATE Session SET lastSeenAt = NOW(3) WHERE id = ?`, [payload.sid]).catch(() => {});
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, userType: true, companyId: true, isActive: true, authVersion: true, department: true, location: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }
    if (payload.av !== undefined && Number(payload.av) !== Number(user.authVersion || 0)) {
      throw new UnauthorizedException();
    }

    return { ...user, sessionId: payload.sid };
  }
}
