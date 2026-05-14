"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../database/prisma.service");
let SettingsService = class SettingsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getSettings(companyId) {
        if (!companyId)
            throw new common_1.ForbiddenException('No company context available');
        const company = await this.prisma.company.findUnique({
            where: { id: companyId },
            select: { id: true, name: true, slug: true, domain: true, logo: true, branding: true, settings: true },
        });
        if (!company)
            throw new common_1.NotFoundException('Company not found');
        return {
            ...company,
            settings: company.settings ? JSON.parse(company.settings) : {},
            branding: company.branding ? JSON.parse(company.branding) : {},
        };
    }
    async updateSettings(companyId, dto) {
        if (!companyId)
            throw new common_1.ForbiddenException('No company context available');
        const company = await this.prisma.company.findUnique({ where: { id: companyId } });
        if (!company)
            throw new common_1.NotFoundException('Company not found');
        const updateData = {};
        if (dto.name)
            updateData.name = dto.name;
        if (dto.domain !== undefined)
            updateData.domain = dto.domain;
        if (dto.logo !== undefined)
            updateData.logo = dto.logo;
        if (dto.branding)
            updateData.branding = dto.branding;
        if (dto.settings)
            updateData.settings = dto.settings;
        return this.prisma.company.update({
            where: { id: companyId },
            data: updateData,
            select: { id: true, name: true, domain: true, logo: true, branding: true, settings: true },
        });
    }
    async updateBranding(companyId, branding) {
        if (!companyId)
            throw new common_1.ForbiddenException('No company context available');
        const company = await this.prisma.company.findUnique({ where: { id: companyId } });
        if (!company)
            throw new common_1.NotFoundException('Company not found');
        const existing = company.branding ? JSON.parse(company.branding) : {};
        const merged = { ...existing, ...branding };
        return this.prisma.company.update({
            where: { id: companyId },
            data: { branding: JSON.stringify(merged) },
            select: { id: true, name: true, branding: true },
        });
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SettingsService);
//# sourceMappingURL=settings.service.js.map