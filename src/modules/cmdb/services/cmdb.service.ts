import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import * as crypto from 'crypto';

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
    const asset = await this.prisma.asset.update({
      where: { id },
      data: this.normalizeDevicePayload({
        ...dto,
        enrollmentStatus: dto.enrollmentStatus || 'ENROLLED',
        lastCheckInAt: new Date(),
      }),
    });
    const commands = await this.listDeviceCommands(id, companyId, 'PENDING');
    return { ...asset, pendingCommands: commands };
  }

  async runDeviceAction(id: string, action: string, body: any, companyId: string, requestedById?: string) {
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

    const command = await this.createMdmCommand({
      companyId,
      assetId: id,
      action: normalizedAction,
      payload: body || {},
      requestedById,
    });
    const updated = await this.prisma.asset.update({ where: { id }, data });
    return { ...updated, queuedCommand: command };
  }

  async createEnrollmentToken(companyId: string, dto: any = {}) {
    const now = new Date();
    const ttlHours = Math.max(1, Math.min(168, Number(dto.ttlHours || 24)));
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
    const token = `mdm_${crypto.randomBytes(24).toString('hex')}`;
    const id = crypto.randomUUID();
    const deviceCategory = String(dto.deviceCategory || 'LAPTOP').toUpperCase();
    const ownership = String(dto.ownership || 'COMPANY').toUpperCase();

    await this.prisma.execute(
      `INSERT INTO MdmEnrollmentToken (id, companyId, token, deviceCategory, ownership, policyProfile, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, token, deviceCategory, ownership, dto.policyProfile || null, expiresAt, now],
    );

    return { id, token, companyId, deviceCategory, ownership, policyProfile: dto.policyProfile || null, expiresAt, usedAt: null };
  }

  async listEnrollmentTokens(companyId: string) {
    return this.prisma.query(
      `SELECT id, companyId, token, deviceCategory, ownership, policyProfile, expiresAt, usedAt, assetId, createdAt
       FROM MdmEnrollmentToken
       WHERE companyId = ?
       ORDER BY createdAt DESC
       LIMIT 25`,
      [companyId],
    );
  }

  async enrollWithToken(dto: any) {
    const token = String(dto.token || '').trim();
    if (!token) throw new BadRequestException('Enrollment token is required');

    const rows = await this.prisma.query<any[]>(
      `SELECT * FROM MdmEnrollmentToken WHERE token = ? AND usedAt IS NULL AND expiresAt > NOW() LIMIT 1`,
      [token],
    );
    const enrollment = rows[0];
    if (!enrollment) throw new UnauthorizedException('Enrollment token is invalid or expired');

    const deviceToken = crypto.randomUUID();
    const asset = await this.prisma.asset.create({
      data: this.normalizeDevicePayload({
        name: dto.name || dto.hostname || 'Managed device',
        assetType: dto.assetType || enrollment.deviceCategory || 'LAPTOP',
        deviceCategory: dto.deviceCategory || enrollment.deviceCategory || 'LAPTOP',
        ownership: dto.ownership || enrollment.ownership || 'COMPANY',
        serialNumber: dto.serialNumber,
        manufacturer: dto.manufacturer,
        model: dto.model,
        os: dto.os,
        osVersion: dto.osVersion,
        ipAddress: dto.ipAddress,
        macAddress: dto.macAddress,
        imei: dto.imei,
        phoneNumber: dto.phoneNumber,
        carrier: dto.carrier,
        batteryLevel: dto.batteryLevel,
        companyId: enrollment.companyId,
        status: 'active',
        enrollmentStatus: 'ENROLLED',
        managementMode: dto.managementMode || 'AGENT',
        mdmProvider: dto.mdmProvider || 'FieldserviceIT',
        mdmDeviceId: deviceToken,
        lastCheckInAt: new Date(),
        complianceStatus: dto.complianceStatus || 'UNKNOWN',
        policyProfile: dto.policyProfile || enrollment.policyProfile,
      }),
    });

    await this.prisma.execute(
      `UPDATE MdmEnrollmentToken SET usedAt = ?, assetId = ? WHERE id = ?`,
      [new Date(), asset.id, enrollment.id],
    );

    return { asset, deviceToken };
  }

  async checkInWithDeviceToken(assetId: string, deviceToken: string, dto: any) {
    const asset = await this.findByDeviceCredential(assetId, deviceToken);
    const companyId = asset.companyId;
    const updated = await this.prisma.asset.update({
      where: { id: asset.id },
      data: this.normalizeDevicePayload({
        ...dto,
        enrollmentStatus: 'ENROLLED',
        lastCheckInAt: new Date(),
      }),
    });
    const commands = await this.listDeviceCommands(asset.id, companyId, 'PENDING');
    return { asset: updated, commands };
  }

  async listDeviceCommands(assetId: string, companyId: string, status?: string) {
    const values: any[] = [assetId, companyId];
    let sql = `SELECT * FROM MdmCommand WHERE assetId = ? AND companyId = ?`;
    if (status) {
      sql += ` AND status = ?`;
      values.push(status);
    }
    sql += ` ORDER BY createdAt DESC LIMIT 50`;
    const rows = await this.prisma.query<any[]>(sql, values);
    return rows.map((row) => this.parseMdmCommand(row));
  }

  async listDeviceCommandsByToken(assetId: string, deviceToken: string) {
    const asset = await this.findByDeviceCredential(assetId, deviceToken);
    return this.listDeviceCommands(asset.id, asset.companyId, 'PENDING');
  }

  async completeDeviceCommand(commandId: string, deviceToken: string, dto: any = {}) {
    const rows = await this.prisma.query<any[]>(
      `SELECT c.*, a.mdmDeviceId, a.companyId FROM MdmCommand c
       INNER JOIN Asset a ON a.id = c.assetId
       WHERE c.id = ?
       LIMIT 1`,
      [commandId],
    );
    const command = rows[0];
    if (!command || command.mdmDeviceId !== deviceToken) {
      throw new UnauthorizedException('Device command credential is invalid');
    }

    const status = dto.status === 'FAILED' ? 'FAILED' : 'COMPLETED';
    await this.prisma.execute(
      `UPDATE MdmCommand SET status = ?, result = ?, completedAt = ?, updatedAt = ? WHERE id = ?`,
      [status, JSON.stringify(dto.result || {}), new Date(), new Date(), commandId],
    );
    const updatedRows = await this.prisma.query<any[]>(`SELECT * FROM MdmCommand WHERE id = ? LIMIT 1`, [commandId]);
    return this.parseMdmCommand(updatedRows[0]);
  }

  private async createMdmCommand(input: { companyId: string; assetId: string; action: string; payload?: any; requestedById?: string }) {
    const id = crypto.randomUUID();
    const now = new Date();
    await this.prisma.execute(
      `INSERT INTO MdmCommand (id, companyId, assetId, action, payload, status, requestedById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [id, input.companyId, input.assetId, input.action, JSON.stringify(input.payload || {}), input.requestedById || null, now, now],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM MdmCommand WHERE id = ? LIMIT 1`, [id]);
    return this.parseMdmCommand(rows[0]);
  }

  private async findByDeviceCredential(assetId: string, deviceToken: string, companyId?: string) {
    let sql = `SELECT * FROM Asset WHERE id = ? AND mdmDeviceId = ? AND deletedAt IS NULL`;
    const params: any[] = [assetId, deviceToken];
    if (companyId) {
      sql += ` AND companyId = ?`;
      params.push(companyId);
    }
    sql += ` LIMIT 1`;
    const rows = await this.prisma.query<any[]>(sql, params);
    if (!rows[0]) throw new UnauthorizedException('Device credential is invalid');
    return rows[0];
  }

  private parseMdmCommand(row: any) {
    if (!row) return row;
    if (typeof row.payload === 'string') {
      try { row.payload = JSON.parse(row.payload); } catch { /* ignore */ }
    }
    if (typeof row.result === 'string') {
      try { row.result = JSON.parse(row.result); } catch { /* ignore */ }
    }
    return row;
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
