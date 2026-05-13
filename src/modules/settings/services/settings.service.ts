import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

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
      settings: company.settings ? JSON.parse(company.settings) : {},
      branding: company.branding ? JSON.parse(company.branding) : {},
    };
  }

  async updateSettings(companyId: string, dto: {
    name?: string;
    domain?: string;
    logo?: string;
    branding?: string;
    settings?: string;
  }) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.domain !== undefined) updateData.domain = dto.domain;
    if (dto.logo !== undefined) updateData.logo = dto.logo;
    if (dto.branding) updateData.branding = dto.branding;
    if (dto.settings) updateData.settings = dto.settings;

    return this.prisma.company.update({
      where: { id: companyId },
      data: updateData,
      select: { id: true, name: true, domain: true, logo: true, branding: true, settings: true },
    });
  }

  async updateBranding(companyId: string, branding: { primaryColor?: string; logoUrl?: string; companyName?: string }) {
    if (!companyId) throw new ForbiddenException('No company context available');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const existing = company.branding ? JSON.parse(company.branding) : {};
    const merged = { ...existing, ...branding };

    return this.prisma.company.update({
      where: { id: companyId },
      data: { branding: JSON.stringify(merged) },
      select: { id: true, name: true, branding: true },
    });
  }
}
