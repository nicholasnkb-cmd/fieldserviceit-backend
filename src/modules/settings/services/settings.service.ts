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

  async getSettings(companyId: string) {
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

  async updateSettings(companyId: string, dto: {
    name?: string;
    domain?: string;
    logo?: string;
    timezone?: string;
    locale?: string;
    featureOverrides?: Record<string, boolean>;
    restrictions?: Record<string, string | number | boolean>;
  }) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

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

  async updateBranding(companyId: string, branding: TenantBranding) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const existing = safeJson<TenantBranding>(company.branding, {});
    const sanitized = sanitizeBranding(branding);
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

  async updateCustomization(companyId: string, customization: TenantCustomization) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const settings = safeJson<Record<string, any>>(company.settings, {});
    const existing = (settings.customization || {}) as TenantCustomization;
    const sanitized = sanitizeCustomization(customization);
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

  async configureUploadedImage(companyId: string, field: string, url: string) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const allowedFields = new Set(['logoUrl', 'faviconUrl', 'loginBackgroundUrl', 'sidebarImageUrl', 'bannerImageUrl']);
    if (!allowedFields.has(field)) throw new ForbiddenException('Unsupported tenant image field');

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

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
}
