import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

const managedDeviceTypes = new Set([
  'DESKTOP',
  'LAPTOP',
  'MOBILE',
  'TABLET',
  'SERVER',
  'IOT',
  'CHROMEBOOK',
  'RUGGED',
  'WEARABLE',
  'KIOSK',
  'NETWORK_DEVICE',
  'PRINTER',
]);

@Injectable()
export class CmdbService {
  constructor(private prisma: PrismaService) {}

  async create(dto: any, companyId: string) {
    const data = this.normalizeDevicePayload(dto);
    return this.prisma.asset.create({ data: { ...data, companyId } });
  }

  async findAll(companyId: string, query: { page?: number; limit?: number; assetType?: string; search?: string; deviceCategory?: string; enrollmentStatus?: string; complianceStatus?: string; ownership?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = { companyId, deletedAt: null };
    if (query.assetType) where.assetType = query.assetType;
    if (query.deviceCategory) where.deviceCategory = query.deviceCategory;
    if (query.enrollmentStatus) where.enrollmentStatus = query.enrollmentStatus;
    if (query.complianceStatus) where.complianceStatus = query.complianceStatus;
    if (query.ownership) where.ownership = query.ownership;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { serialNumber: { contains: query.search } },
        { ipAddress: { contains: query.search } },
        { imei: { contains: query.search } },
        { assignedUser: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.asset.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.asset.count({ where }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getMdmSummary(companyId: string) {
    const where = { companyId, deletedAt: null };
    const [total, enrolled, unmanaged, nonCompliant, stale, mobile, desktop, server] = await Promise.all([
      this.prisma.asset.count({ where }),
      this.prisma.asset.count({ where: { ...where, enrollmentStatus: 'ENROLLED' } }),
      this.prisma.asset.count({ where: { ...where, enrollmentStatus: 'UNMANAGED' } }),
      this.prisma.asset.count({ where: { ...where, complianceStatus: 'NON_COMPLIANT' } }),
      this.prisma.asset.count({ where: { ...where, enrollmentStatus: 'STALE' } }),
      this.prisma.asset.count({ where: { ...where, deviceCategory: 'MOBILE' } }),
      this.prisma.asset.count({ where: { ...where, deviceCategory: 'DESKTOP' } }),
      this.prisma.asset.count({ where: { ...where, deviceCategory: 'SERVER' } }),
    ]);

    return {
      total,
      enrolled,
      unmanaged,
      nonCompliant,
      stale,
      byCategory: { mobile, desktop, server, other: Math.max(0, total - mobile - desktop - server) },
      complianceRate: enrolled > 0 ? Math.round(((enrolled - nonCompliant) / enrolled) * 100) : 0,
    };
  }

  async findOne(id: string, companyId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { tickets: { take: 10, orderBy: { createdAt: 'desc' } } },
    });

    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }

  async update(id: string, dto: any, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.asset.update({ where: { id }, data: this.normalizeDevicePayload(dto) });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async checkIn(id: string, dto: any, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.asset.update({
      where: { id },
      data: this.normalizeDevicePayload({
        ...dto,
        enrollmentStatus: dto.enrollmentStatus || 'ENROLLED',
        lastCheckInAt: new Date(),
      }),
    });
  }

  async runDeviceAction(id: string, action: string, body: any, companyId: string) {
    const asset = await this.findOne(id, companyId);
    const normalizedAction = String(action || '').toUpperCase();
    const allowed = ['LOCK', 'WIPE', 'RESTART', 'LOST_MODE', 'CLEAR_LOST_MODE', 'SYNC', 'PUSH_POLICY'];
    if (!allowed.includes(normalizedAction)) {
      throw new NotFoundException('Device action not supported');
    }

    const notes = [
      asset.notes,
      `[MDM ${new Date().toISOString()}] ${normalizedAction}${body?.reason ? `: ${body.reason}` : ''}`,
    ].filter(Boolean).join('\n');

    const data: any = { notes };
    if (normalizedAction === 'LOST_MODE') data.lostModeEnabled = true;
    if (normalizedAction === 'CLEAR_LOST_MODE') data.lostModeEnabled = false;
    if (normalizedAction === 'PUSH_POLICY' && body?.policyProfile) data.policyProfile = body.policyProfile;
    if (normalizedAction === 'SYNC') data.lastCheckInAt = new Date();

    return this.prisma.asset.update({ where: { id }, data });
  }

  private normalizeDevicePayload(dto: any) {
    const data: any = { ...dto };
    if (data.deviceCategory) data.deviceCategory = String(data.deviceCategory).toUpperCase();
    if (data.assetType) data.assetType = String(data.assetType).toUpperCase();
    if (data.deviceCategory && managedDeviceTypes.has(data.deviceCategory) && !data.assetType) {
      data.assetType = data.deviceCategory;
    }
    if (!data.deviceCategory && data.assetType) {
      const assetType = String(data.assetType).toUpperCase();
      data.deviceCategory = managedDeviceTypes.has(assetType) ? assetType : 'OTHER';
    }
    if (data.enrollmentStatus) data.enrollmentStatus = String(data.enrollmentStatus).toUpperCase();
    if (data.complianceStatus) data.complianceStatus = String(data.complianceStatus).toUpperCase();
    if (data.ownership) data.ownership = String(data.ownership).toUpperCase();
    if (data.encryptionStatus) data.encryptionStatus = String(data.encryptionStatus).toUpperCase();
    if (data.batteryLevel !== undefined && data.batteryLevel !== '') {
      data.batteryLevel = Math.max(0, Math.min(100, Number(data.batteryLevel)));
    }
    return data;
  }
}
