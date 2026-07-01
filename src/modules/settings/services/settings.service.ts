import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  safeJson,
  sanitizeBranding,
  sanitizeCustomization,
  TenantBranding,
  TenantCustomization,
} from '../tenant-customization';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings(companyId: string | null | undefined) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, slug: true, domain: true, logo: true, branding: true, settings: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    return {
      ...company,
      settings: safeJson(company.settings, {}),
      branding: safeJson(company.branding, {}),
    };
  }

  async updateSettings(companyId: string | null | undefined, dto: {
    name?: string;
    domain?: string;
    logo?: string;
    timezone?: string;
    locale?: string;
    featureOverrides?: Record<string, boolean>;
    restrictions?: Record<string, string | number | boolean>;
  }, actorId?: string) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    await this.snapshot(companyId, actorId, company, 'SETTINGS_UPDATE');

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.domain !== undefined) updateData.domain = dto.domain;
    if (dto.logo !== undefined) updateData.logo = dto.logo;
    const existingSettings = safeJson<Record<string, any>>(company.settings, {});
    const settings: any = { ...existingSettings };
    if (dto.timezone !== undefined) settings.timezone = dto.timezone;
    if (dto.locale !== undefined) settings.locale = dto.locale;
    if (dto.featureOverrides !== undefined) {
      settings.featureOverrides = {
        ...(settings.featureOverrides || {}),
        ...dto.featureOverrides,
      };
    }
    if (dto.restrictions !== undefined) {
      settings.restrictions = {
        ...(settings.restrictions || {}),
        ...dto.restrictions,
      };
    }
    if (
      dto.timezone !== undefined ||
      dto.locale !== undefined ||
      dto.featureOverrides !== undefined ||
      dto.restrictions !== undefined
    ) {
      updateData.settings = JSON.stringify(settings);
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: updateData,
      select: { id: true, name: true, domain: true, logo: true, branding: true, settings: true },
    });
  }

  async updateBranding(companyId: string | null | undefined, branding: TenantBranding, actorId?: string) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const existing = safeJson<TenantBranding>(company.branding, {});
    const sanitized = sanitizeBranding(branding);
    await this.snapshot(companyId, actorId, company, 'BRANDING_UPDATE');
    const merged = Object.fromEntries(
      Object.entries({ ...existing, ...sanitized }).filter(([, value]) => value !== undefined),
    );

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        branding: JSON.stringify(merged),
        logo: sanitized.logoUrl === undefined ? company.logo : sanitized.logoUrl,
      },
      select: { id: true, name: true, logo: true, branding: true, settings: true },
    });
    return { ...updated, branding: safeJson(updated.branding, {}), settings: safeJson(updated.settings, {}) };
  }

  async updateCustomization(companyId: string | null | undefined, customization: TenantCustomization, actorId?: string) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const settings = safeJson<Record<string, any>>(company.settings, {});
    const existing = (settings.customization || {}) as TenantCustomization;
    const sanitized = sanitizeCustomization(customization);
    await this.snapshot(companyId, actorId, company, 'CUSTOMIZATION_UPDATE');
    const defined = (value: Record<string, any>) => Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined),
    );
    settings.customization = {
      ...existing,
      banner: { ...(existing.banner || {}), ...defined(sanitized.banner || {}) },
      workflow: { ...(existing.workflow || {}), ...defined(sanitized.workflow || {}) },
      reporting: { ...(existing.reporting || {}), ...defined(sanitized.reporting || {}) },
    };

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { settings: JSON.stringify(settings) },
      select: { id: true, name: true, logo: true, branding: true, settings: true },
    });
    return { ...updated, branding: safeJson(updated.branding, {}), settings: safeJson(updated.settings, {}) };
  }

  async resetCustomization(companyId: string | null | undefined, actorId?: string) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    await this.snapshot(companyId, actorId, company, 'CUSTOMIZATION_RESET');

    const settings = safeJson<Record<string, any>>(company.settings, {});
    delete settings.customization;

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        logo: null,
        branding: JSON.stringify({}),
        settings: JSON.stringify(settings),
      },
      select: { id: true, name: true, logo: true, branding: true, settings: true },
    });
    return { ...updated, branding: safeJson(updated.branding, {}), settings: safeJson(updated.settings, {}) };
  }

  async configureUploadedImage(companyId: string, field: string, url: string, actorId?: string) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const allowedFields = new Set(['logoUrl', 'faviconUrl', 'loginBackgroundUrl', 'sidebarImageUrl', 'bannerImageUrl']);
    if (!allowedFields.has(field)) throw new ForbiddenException('Unsupported tenant image field');

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    await this.snapshot(companyId, actorId, company, 'BRANDING_IMAGE_UPLOAD');

    const branding = safeJson<Record<string, any>>(company.branding, {});
    const settings = safeJson<Record<string, any>>(company.settings, {});
    settings.customization ||= {};
    settings.customization.banner ||= {};
    settings.customization.reporting ||= {};

    if (field === 'bannerImageUrl') {
      settings.customization.banner.imageUrl = url;
    } else {
      branding[field] = url;
      if (field === 'logoUrl') {
        settings.customization.reporting.logoUrl = url;
        settings.customization.reporting.showCompanyLogo = true;
      }
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        branding: JSON.stringify(branding),
        settings: JSON.stringify(settings),
        ...(field === 'logoUrl' ? { logo: url } : {}),
      },
      select: { id: true, name: true, logo: true, branding: true, settings: true },
    });

    return {
      ...updated,
      branding: safeJson(updated.branding, {}),
      settings: safeJson(updated.settings, {}),
    };
  }

  async getHistory(companyId: string | null | undefined) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const entries = await this.prisma.auditLog.findMany({
      where: { companyId, resourceType: 'TENANT_SETTINGS', resourceId: companyId },
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return entries.map((entry: any) => {
      const snapshot = safeJson<Record<string, any>>(entry.diff, {});
      return {
        id: entry.id,
        action: entry.action,
        createdAt: entry.createdAt,
        actor: entry.actor,
        summary: {
          companyName: snapshot.name || '',
          primaryColor: snapshot.branding?.primaryColor || '',
          bannerEnabled: snapshot.settings?.customization?.banner?.enabled === true,
        },
      };
    });
  }

  async rollback(companyId: string | null | undefined, historyId: string, actorId: string) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const [company, entry] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.auditLog.findUnique({ where: { id: historyId } }),
    ]);
    if (!company) throw new NotFoundException('Company not found');
    if (!entry || entry.companyId !== companyId || entry.resourceType !== 'TENANT_SETTINGS') {
      throw new NotFoundException('Settings version not found');
    }

    const snapshot = safeJson<Record<string, any>>(entry.diff, {});
    if (!snapshot.branding || !snapshot.settings) {
      throw new NotFoundException('Settings version is incomplete');
    }
    await this.snapshot(companyId, actorId, company, 'SETTINGS_ROLLBACK');

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: snapshot.name || company.name,
        domain: snapshot.domain ?? company.domain,
        logo: snapshot.logo ?? null,
        branding: JSON.stringify(snapshot.branding),
        settings: JSON.stringify(snapshot.settings),
      },
      select: { id: true, name: true, slug: true, domain: true, logo: true, branding: true, settings: true },
    });
    return { ...updated, branding: safeJson(updated.branding, {}), settings: safeJson(updated.settings, {}) };
  }

  private async snapshot(companyId: string, actorId: string | undefined, company: any, action: string) {
    if (!actorId || !this.prisma.auditLog?.create) return;
    await this.prisma.auditLog.create({
      data: {
        companyId,
        actorId,
        action,
        resourceType: 'TENANT_SETTINGS',
        resourceId: companyId,
        diff: JSON.stringify({
          name: company.name,
          domain: company.domain,
          logo: company.logo,
          branding: safeJson(company.branding, {}),
          settings: safeJson(company.settings, {}),
        }),
      },
    });
  }
}
