import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/feature.decorator';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class FeatureAccessGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.companyId) return true;

    const [company, fullUser] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: user.companyId }, select: { settings: true } }),
      this.prisma.user.findUnique({ where: { id: user.id }, select: { featureOverrides: true } }),
    ]);

    const companySettings = this.parseJson(company?.settings);
    const companyOverrides = companySettings.featureOverrides || {};
    const userOverrides = this.parseJson(fullUser?.featureOverrides);
    const explicit = userOverrides[feature] ?? companyOverrides[feature];

    if (explicit === false) {
      throw new ForbiddenException(`${this.label(feature)} is disabled for this account`);
    }

    return true;
  }

  private parseJson(value?: string | null) {
    if (!value) return {};
    try { return JSON.parse(value); } catch { return {}; }
  }

  private label(feature: string) {
    return feature.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
  }
}
