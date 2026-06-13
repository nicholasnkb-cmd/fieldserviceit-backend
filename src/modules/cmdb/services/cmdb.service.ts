import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { EmailService } from '../../notifications/services/email.service';
import { TicketParticipantNotifierService } from '../../tickets/services/ticket-participant-notifier.service';
import * as crypto from 'crypto';
import { credentialLookupValues, credentialMatches, hashCredential } from '../../../common/security/credential-hash';
import { AssetRepository } from '../../../database/repositories/asset.repository';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as dgram from 'dgram';
const snmp = require('net-snmp');

const execFileAsync = promisify(execFile);

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
export class CmdbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CmdbService.name);
  private monitoringRunActive = false;
  private syslogServer?: dgram.Socket;

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private participantNotifier: TicketParticipantNotifierService,
    private assetRepository: AssetRepository,
  ) {}

  onModuleInit() {
    this.startSyslogListener();
  }

  onModuleDestroy() {
    this.syslogServer?.close();
  }

  private startSyslogListener() {
    if (process.env.NETWORK_SYSLOG_ENABLED === 'false') return;
    const port = Number(process.env.NETWORK_SYSLOG_PORT || 5514);
    this.syslogServer = dgram.createSocket('udp4');
    this.syslogServer.on('message', (message, remote) => {
      this.ingestSyslogDatagram(remote.address, message.toString('utf8')).catch((err) => {
        this.logger.warn(`Syslog ingest failed from ${remote.address}: ${err?.message || err}`);
      });
    });
    this.syslogServer.on('error', (err) => {
      this.logger.warn(`Syslog listener error: ${err.message}`);
      this.syslogServer?.close();
      this.syslogServer = undefined;
    });
    this.syslogServer.bind(port, () => {
      this.logger.log(`Network syslog listener active on UDP ${port}`);
    });
  }

  private async ingestSyslogDatagram(host: string, rawMessage: string) {
    const assetRows = await this.prisma.query<any[]>(
      `SELECT id, companyId FROM Asset WHERE ipAddress = ? AND deletedAt IS NULL LIMIT 1`,
      [host],
    );
    const asset = assetRows[0];
    if (!asset) return;
    const parsed = this.parseSyslogMessage(rawMessage);
    await this.prisma.execute(
      `INSERT INTO NetworkSyslogEvent (id, companyId, assetId, host, facility, severity, message, receivedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), asset.companyId, asset.id, host, parsed.facility, parsed.severity, parsed.message, new Date()],
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async runScheduledNetworkMonitoring() {
    if (this.monitoringRunActive) return;
    this.monitoringRunActive = true;
    try {
      const rows = await this.prisma.query<any[]>(
        `SELECT c.assetId, c.companyId, c.pingIntervalSec, a.name, a.ipAddress,
          MAX(h.createdAt) as lastSnapshotAt
         FROM NetworkMonitoringConfig c
         INNER JOIN Asset a ON a.id = c.assetId
         LEFT JOIN NetworkHealthSnapshot h ON h.assetId = c.assetId
         WHERE c.pingEnabled = 1
           AND a.deletedAt IS NULL
           AND a.assetType = 'NETWORK_DEVICE'
           AND a.ipAddress IS NOT NULL
         GROUP BY c.assetId, c.companyId, c.pingIntervalSec, a.name, a.ipAddress
         LIMIT 100`,
      );

      const now = Date.now();
      for (const row of rows) {
        const intervalMs = Math.max(15, Number(row.pingIntervalSec || 60)) * 1000;
        const last = row.lastSnapshotAt ? new Date(row.lastSnapshotAt).getTime() : 0;
        if (last && now - last < intervalMs) continue;
        if (await this.isInMaintenanceWindow(row.assetId, row.companyId)) continue;
        await this.runPingCheck(row.assetId, row.companyId).catch((err) => {
          this.logger.warn(`Scheduled ping failed for ${row.name}: ${err?.message || err}`);
        });
        await this.runSnmpPoll(row.assetId, row.companyId).catch((err) => {
          this.logger.warn(`Scheduled SNMP poll failed for ${row.name}: ${err?.message || err}`);
        });
      }
    } catch (err: any) {
      this.logger.warn(`Scheduled network monitoring failed: ${err?.message || err}`);
    } finally {
      this.monitoringRunActive = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runNetworkRetentionCleanup() {
    try {
      const policies = await this.prisma.query<any[]>(`SELECT * FROM NetworkRetentionPolicy`);
      for (const policy of policies) {
        await this.prisma.execute(
          `DELETE FROM NetworkHealthSnapshot WHERE companyId = ? AND createdAt < DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [policy.companyId, Number(policy.snapshotDays || 30)],
        );
        await this.prisma.execute(
          `DELETE FROM NetworkSyslogEvent WHERE companyId = ? AND receivedAt < DATE_SUB(NOW(), INTERVAL ? DAY)`,
          [policy.companyId, Number(policy.syslogDays || 30)],
        );
      }
    } catch (err: any) {
      this.logger.warn(`Network retention cleanup failed: ${err?.message || err}`);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runAlertEscalations() {
    try {
      const alerts = await this.prisma.query<any[]>(
        `SELECT e.*, r.severity FROM NetworkAlertEvent e
         LEFT JOIN NetworkAlertRule r ON r.id = e.ruleId
         WHERE e.status = 'ACTIVE' AND e.triggeredAt < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
         LIMIT 100`,
      );
      for (const alert of alerts) {
        await this.sendAlertNotifications(alert.companyId, `Escalation: ${alert.title}`, alert.details || 'Network alert remains active', alert.ticketId);
      }
    } catch (err: any) {
      this.logger.warn(`Network alert escalation failed: ${err?.message || err}`);
    }
  }

  async create(dto: any, companyId: string) {
    const data = this.normalizeDevicePayload(dto);
    return this.prisma.asset.create({ data: { ...data, companyId } });
  }

  async findAll(companyId: string, query: { page?: number; limit?: number; assetType?: string; search?: string; deviceCategory?: string; enrollmentStatus?: string; complianceStatus?: string; ownership?: string; permissionScopes?: any[]; user?: any }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const where: any = { companyId, deletedAt: null };
    this.applyAssetScopes(where, query.permissionScopes, query.user);
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

  private applyAssetScopes(where: any, scopes: any[] | undefined, user: any) {
    const matching = (scopes || []).filter((scope) => String(scope.permissionSlug || '').startsWith('assets.'));
    if (!matching.length || matching.some((scope) => scope.scopeType === 'ALL')) return;
    const alternatives: any[] = [];
    for (const scope of matching) {
      if (scope.scopeType === 'ASSIGNED') alternatives.push({ assignedUser: user?.email || user?.id });
      if (scope.scopeType === 'LOCATION' && user?.location) alternatives.push({ location: user.location });
      if (scope.scopeType === 'CUSTOMERS') {
        const values = this.parseScopeValues(scope.scopeValues);
        if (values.length) alternatives.push({ companyId: { in: values } });
      }
    }
    where.AND = [...(where.AND || []), alternatives.length ? { OR: alternatives } : { id: '__scope_denied__' }];
  }

  private parseScopeValues(value: any): string[] {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
    } catch {
      return [];
    }
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
    return this.assetRepository.findTenantAsset(
      id,
      companyId,
      { tickets: { take: 10, orderBy: { createdAt: 'desc' } } },
    );
  }

  async update(id: string, dto: any, companyId: string) {
    return this.assetRepository.updateTenantAsset(id, companyId, this.normalizeDevicePayload(dto));
  }

  async remove(id: string, companyId: string) {
    return this.assetRepository.retireTenantAsset(id, companyId);
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
      [id, companyId, hashCredential(token), deviceCategory, ownership, dto.policyProfile || null, expiresAt, now],
    );

    return { id, token, companyId, deviceCategory, ownership, policyProfile: dto.policyProfile || null, expiresAt, usedAt: null };
  }

  async listEnrollmentTokens(companyId: string) {
    return this.prisma.query(
      `SELECT id, companyId, deviceCategory, ownership, policyProfile, expiresAt, usedAt, assetId, createdAt
       FROM MdmEnrollmentToken
       WHERE companyId = ?
       ORDER BY createdAt DESC
       LIMIT 25`,
      [companyId],
    );
  }

  async getNetworkMonitoringSummary(companyId: string) {
    const [totalRows, onlineRows, offlineRows, latestRows, alertRows, eventRows] = await Promise.all([
      this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM Asset WHERE companyId = ? AND deletedAt IS NULL AND assetType = 'NETWORK_DEVICE'`, [companyId]),
      this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM NetworkHealthSnapshot h INNER JOIN (
        SELECT assetId, MAX(createdAt) as createdAt FROM NetworkHealthSnapshot WHERE companyId = ? GROUP BY assetId
      ) latest ON latest.assetId = h.assetId AND latest.createdAt = h.createdAt WHERE h.status = 'ONLINE'`, [companyId]),
      this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM NetworkHealthSnapshot h INNER JOIN (
        SELECT assetId, MAX(createdAt) as createdAt FROM NetworkHealthSnapshot WHERE companyId = ? GROUP BY assetId
      ) latest ON latest.assetId = h.assetId AND latest.createdAt = h.createdAt WHERE h.status = 'OFFLINE'`, [companyId]),
      this.prisma.query<any[]>(`SELECT h.* FROM NetworkHealthSnapshot h INNER JOIN (
        SELECT assetId, MAX(createdAt) as createdAt FROM NetworkHealthSnapshot WHERE companyId = ? GROUP BY assetId
      ) latest ON latest.assetId = h.assetId AND latest.createdAt = h.createdAt ORDER BY h.createdAt DESC LIMIT 20`, [companyId]),
      this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM NetworkAlertRule WHERE companyId = ? AND enabled = 1`, [companyId]),
      this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM NetworkAlertEvent WHERE companyId = ? AND status = 'ACTIVE'`, [companyId]),
    ]);

    return {
      total: Number(totalRows[0]?.count || 0),
      online: Number(onlineRows[0]?.count || 0),
      offline: Number(offlineRows[0]?.count || 0),
      activeAlertRules: Number(alertRows[0]?.count || 0),
      activeAlerts: Number(eventRows[0]?.count || 0),
      latest: latestRows.map((row) => this.parseNetworkSnapshot(row)),
    };
  }

  async getNetworkMonitoring(assetId: string, companyId: string) {
    await this.findOne(assetId, companyId);
    const [configRows, snapshots, syslogEvents, alertRules] = await Promise.all([
      this.prisma.query<any[]>(`SELECT * FROM NetworkMonitoringConfig WHERE assetId = ? AND companyId = ? LIMIT 1`, [assetId, companyId]),
      this.listNetworkSnapshots(assetId, companyId, 10),
      this.listSyslogEvents(assetId, companyId, 10),
      this.listAlertRules(assetId, companyId),
    ]);

    return {
      config: this.parseMonitoringConfig(configRows[0] || this.defaultMonitoringConfig(assetId, companyId)),
      latestSnapshot: snapshots[0] || null,
      snapshots,
      syslogEvents,
      alertRules,
    };
  }

  async updateNetworkMonitoring(assetId: string, companyId: string, dto: any = {}) {
    await this.findOne(assetId, companyId);
    const existing = await this.prisma.query<any[]>(
      `SELECT * FROM NetworkMonitoringConfig WHERE assetId = ? AND companyId = ? LIMIT 1`,
      [assetId, companyId],
    );
    const data = this.normalizeMonitoringConfig(dto);
    if (data.snmpCommunity === undefined) data.snmpCommunity = existing[0]?.snmpCommunity || null;
    if (data.vendorApiKey === undefined) data.vendorApiKey = existing[0]?.vendorApiKey || null;
    const now = new Date();

    if (existing[0]) {
      await this.prisma.execute(
        `UPDATE NetworkMonitoringConfig
         SET pingEnabled = ?, pingIntervalSec = ?, snmpEnabled = ?, snmpVersion = ?, snmpCommunity = ?,
             snmpUsername = ?, snmpAuthProtocol = ?, snmpPrivacyProtocol = ?, syslogEnabled = ?, syslogPort = ?,
             vendor = ?, vendorControllerUrl = ?, vendorSiteId = ?, vendorApiKey = ?, updatedAt = ?
         WHERE id = ? AND companyId = ?`,
        [
          data.pingEnabled, data.pingIntervalSec, data.snmpEnabled, data.snmpVersion, data.snmpCommunity,
          data.snmpUsername, data.snmpAuthProtocol, data.snmpPrivacyProtocol, data.syslogEnabled, data.syslogPort,
          data.vendor, data.vendorControllerUrl, data.vendorSiteId, data.vendorApiKey, now, existing[0].id, companyId,
        ],
      );
    } else {
      await this.prisma.execute(
        `INSERT INTO NetworkMonitoringConfig
         (id, companyId, assetId, pingEnabled, pingIntervalSec, snmpEnabled, snmpVersion, snmpCommunity,
          snmpUsername, snmpAuthProtocol, snmpPrivacyProtocol, syslogEnabled, syslogPort, vendor,
          vendorControllerUrl, vendorSiteId, vendorApiKey, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(), companyId, assetId, data.pingEnabled, data.pingIntervalSec, data.snmpEnabled,
          data.snmpVersion, data.snmpCommunity, data.snmpUsername, data.snmpAuthProtocol, data.snmpPrivacyProtocol,
          data.syslogEnabled, data.syslogPort, data.vendor, data.vendorControllerUrl, data.vendorSiteId,
          data.vendorApiKey, now, now,
        ],
      );
    }

    return this.getNetworkMonitoring(assetId, companyId);
  }

  async runPingCheck(assetId: string, companyId: string) {
    const asset = await this.findOne(assetId, companyId);
    if (!asset.ipAddress) throw new BadRequestException('Device needs a management IP address before ping monitoring can run');

    const started = Date.now();
    let status = 'OFFLINE';
    let latencyMs: number | null = null;
    let packetLossPct = 100;
    let message = '';

    try {
      const args = process.platform === 'win32' ? ['-n', '1', '-w', '3000', asset.ipAddress] : ['-c', '1', '-W', '3', asset.ipAddress];
      const { stdout } = await execFileAsync('ping', args, { timeout: 5000 });
      status = 'ONLINE';
      latencyMs = this.parsePingLatency(stdout) ?? Date.now() - started;
      packetLossPct = this.parsePacketLoss(stdout) ?? 0;
      message = 'Ping check succeeded';
    } catch (err: any) {
      message = err?.message || 'Ping check failed';
    }

    const snapshot = await this.createNetworkSnapshot({
      companyId,
      assetId,
      status,
      latencyMs,
      packetLossPct,
      source: 'PING',
      message,
    });

    await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        lastCheckInAt: new Date(),
        complianceStatus: status === 'ONLINE' ? 'COMPLIANT' : 'NON_COMPLIANT',
        complianceReasons: status === 'ONLINE' ? null : `Ping failed for ${asset.ipAddress}`,
      },
    });

    return { snapshot, triggeredAlerts: await this.evaluateAlertRules(assetId, companyId, snapshot) };
  }

  async runSnmpPoll(assetId: string, companyId: string) {
    const asset = await this.findOne(assetId, companyId);
    if (!asset.ipAddress) throw new BadRequestException('Device needs a management IP address before SNMP polling can run');
    const monitoring = await this.getMonitoringConfigForPoll(assetId, companyId);
    if (!monitoring?.snmpEnabled) throw new BadRequestException('SNMP polling is not enabled for this device');

    const session = this.createSnmpSession(asset.ipAddress, monitoring);
    try {
      const systemRows = await this.snmpGet(session, ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.3.0']);
      const sysDescr = this.varbindValue(systemRows[0]);
      const uptimeTicks = Number(this.varbindValue(systemRows[1]) || 0);
      const table = await this.snmpTableColumns(session, '1.3.6.1.2.1.2.2.1', [1, 2, 5, 8, 10, 14, 16, 20]);
      const interfaces = this.parseInterfaceTable(table);
      await this.storeInterfaceMetrics(assetId, companyId, interfaces);
      const firmware = await this.storeFirmwareInventory(asset, companyId, sysDescr);
      const snapshot = await this.createNetworkSnapshot({
        companyId,
        assetId,
        status: 'ONLINE',
        uptimeSec: Math.round(uptimeTicks / 100),
        interfaceStatus: interfaces,
        source: 'SNMP',
        message: `SNMP poll collected ${interfaces.length} interfaces`,
      });
      return { snapshot, interfaces, firmware };
    } finally {
      session.close();
    }
  }

  async listInterfaceMetrics(assetId: string, companyId: string) {
    await this.findOne(assetId, companyId);
    return this.prisma.query(
      `SELECT latest.* FROM NetworkInterfaceMetric latest
       INNER JOIN (
         SELECT ifIndex, MAX(createdAt) as createdAt
         FROM NetworkInterfaceMetric
         WHERE assetId = ? AND companyId = ?
         GROUP BY ifIndex
       ) pick ON pick.ifIndex = latest.ifIndex AND pick.createdAt = latest.createdAt
       WHERE latest.assetId = ? AND latest.companyId = ?
       ORDER BY latest.ifIndex ASC`,
      [assetId, companyId, assetId, companyId],
    );
  }

  async listFirmwareInventory(assetId: string, companyId: string) {
    await this.findOne(assetId, companyId);
    return this.prisma.query(
      `SELECT * FROM NetworkFirmwareInventory WHERE assetId = ? AND companyId = ? ORDER BY checkedAt DESC LIMIT 25`,
      [assetId, companyId],
    );
  }

  async listSnapshotSeries(assetId: string, companyId: string, limit = 60) {
    await this.findOne(assetId, companyId);
    return this.prisma.query(
      `SELECT id, status, latencyMs, packetLossPct, cpuPct, memoryPct, source, createdAt
       FROM NetworkHealthSnapshot
       WHERE assetId = ? AND companyId = ?
       ORDER BY createdAt DESC LIMIT ?`,
      [assetId, companyId, Math.min(Math.max(limit, 5), 500)],
    );
  }

  async listNetworkSnapshots(assetId: string, companyId: string, limit = 25) {
    await this.findOne(assetId, companyId);
    const rows = await this.prisma.query<any[]>(
      `SELECT * FROM NetworkHealthSnapshot WHERE assetId = ? AND companyId = ? ORDER BY createdAt DESC LIMIT ?`,
      [assetId, companyId, Math.min(Math.max(limit, 1), 100)],
    );
    return rows.map((row) => this.parseNetworkSnapshot(row));
  }

  async listSyslogEvents(assetId: string, companyId: string, limit = 50) {
    await this.findOne(assetId, companyId);
    return this.prisma.query(
      `SELECT * FROM NetworkSyslogEvent WHERE assetId = ? AND companyId = ? ORDER BY receivedAt DESC LIMIT ?`,
      [assetId, companyId, Math.min(Math.max(limit, 1), 200)],
    );
  }

  async ingestSyslogEvent(assetId: string, companyId: string, dto: any = {}) {
    const asset = await this.findOne(assetId, companyId);
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkSyslogEvent (id, companyId, assetId, host, facility, severity, message, receivedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        assetId,
        dto.host || asset.ipAddress || null,
        dto.facility || null,
        dto.severity || 'INFO',
        String(dto.message || ''),
        new Date(),
      ],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkSyslogEvent WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async listAlertRules(assetId: string, companyId: string) {
    await this.findOne(assetId, companyId);
    return this.prisma.query(
      `SELECT * FROM NetworkAlertRule WHERE companyId = ? AND (assetId = ? OR assetId IS NULL) ORDER BY createdAt DESC`,
      [companyId, assetId],
    );
  }

  async listNetworkAlertRules(companyId: string) {
    return this.prisma.query(
      `SELECT r.*, a.name as assetName, a.hostname as assetHostname
       FROM NetworkAlertRule r
       LEFT JOIN Asset a ON a.id = r.assetId
       WHERE r.companyId = ?
       ORDER BY r.createdAt DESC
       LIMIT 200`,
      [companyId],
    );
  }

  async createNetworkAlertRule(companyId: string, dto: any = {}) {
    if (dto.assetId) await this.findOne(dto.assetId, companyId);
    const data = this.normalizeAlertRule(dto);
    const id = crypto.randomUUID();
    const now = new Date();
    await this.prisma.execute(
      `INSERT INTO NetworkAlertRule
       (id, companyId, assetId, name, metric, operator, threshold, durationSec, severity, enabled, notifyEmail, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, dto.assetId || null, data.name, data.metric, data.operator, data.threshold, data.durationSec, data.severity, data.enabled, data.notifyEmail, now, now],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkAlertRule WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async createAlertRule(assetId: string, companyId: string, dto: any = {}) {
    await this.findOne(assetId, companyId);
    const data = this.normalizeAlertRule(dto);
    const id = crypto.randomUUID();
    const now = new Date();
    await this.prisma.execute(
      `INSERT INTO NetworkAlertRule
       (id, companyId, assetId, name, metric, operator, threshold, durationSec, severity, enabled, notifyEmail, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, assetId, data.name, data.metric, data.operator, data.threshold, data.durationSec, data.severity, data.enabled, data.notifyEmail, now, now],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkAlertRule WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async updateAlertRule(assetId: string, ruleId: string, companyId: string, dto: any = {}) {
    await this.findOne(assetId, companyId);
    const data = this.normalizeAlertRule(dto, true);
    const keys = Object.keys(data);
    if (keys.length === 0) throw new BadRequestException('No alert rule fields provided');
    const set = [...keys.map((key) => `${key} = ?`), 'updatedAt = ?'].join(', ');
    await this.prisma.execute(
      `UPDATE NetworkAlertRule SET ${set} WHERE id = ? AND companyId = ? AND (assetId = ? OR assetId IS NULL)`,
      [...keys.map((key) => data[key]), new Date(), ruleId, companyId, assetId],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkAlertRule WHERE id = ? AND companyId = ? LIMIT 1`, [ruleId, companyId]);
    if (!rows[0]) throw new NotFoundException('Alert rule not found');
    return rows[0];
  }

  async listNetworkAlertEvents(companyId: string, status = 'ACTIVE') {
    const values: any[] = [companyId];
    let where = `companyId = ?`;
    if (status && status.toUpperCase() !== 'ALL') {
      where += ` AND status = ?`;
      values.push(status.toUpperCase());
    }
    return this.prisma.query(
      `SELECT e.*, a.name as assetName, a.hostname as assetHostname, r.severity, r.metric, r.operator, r.threshold, t.ticketNumber
       FROM NetworkAlertEvent e
       LEFT JOIN Asset a ON a.id = e.assetId
       LEFT JOIN NetworkAlertRule r ON r.id = e.ruleId
       LEFT JOIN Ticket t ON t.id = e.ticketId
       WHERE ${where}
       ORDER BY e.triggeredAt DESC
       LIMIT 100`,
      values,
    );
  }

  async updateNetworkAlertEvent(companyId: string, eventId: string, status: string, actorId?: string) {
    const normalized = String(status || '').toUpperCase();
    if (!['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'].includes(normalized)) {
      throw new BadRequestException('Invalid alert status');
    }
    const data: any = { status: normalized };
    if (normalized === 'RESOLVED') data.resolvedAt = new Date();
    if (normalized !== 'RESOLVED') data.resolvedAt = null;
    const keys = Object.keys(data);
    await this.prisma.execute(
      `UPDATE NetworkAlertEvent SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ? AND companyId = ?`,
      [...keys.map((key) => data[key]), eventId, companyId],
    );
    await this.auditNetworkChange(companyId, actorId, `network.alert.${normalized.toLowerCase()}`, 'NetworkAlertEvent', eventId);
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkAlertEvent WHERE id = ? AND companyId = ? LIMIT 1`, [eventId, companyId]);
    if (!rows[0]) throw new NotFoundException('Alert event not found');
    return rows[0];
  }

  async listMaintenanceWindows(companyId: string) {
    return this.prisma.query(
      `SELECT * FROM NetworkMaintenanceWindow WHERE companyId = ? ORDER BY startsAt DESC LIMIT 100`,
      [companyId],
    );
  }

  async createMaintenanceWindow(companyId: string, dto: any = {}) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : new Date(startsAt.getTime() + 60 * 60 * 1000);
    if (endsAt <= startsAt) throw new BadRequestException('Maintenance end time must be after start time');
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkMaintenanceWindow (id, companyId, assetId, name, startsAt, endsAt, suppressAlerts, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, dto.assetId || null, dto.name || 'Maintenance window', startsAt, endsAt, dto.suppressAlerts === false ? 0 : 1, new Date()],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkMaintenanceWindow WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async listConfigBackups(assetId: string, companyId: string) {
    await this.findOne(assetId, companyId);
    return this.prisma.query(
      `SELECT id, companyId, assetId, source, checksum, createdAt FROM NetworkConfigBackup
       WHERE assetId = ? AND companyId = ? ORDER BY createdAt DESC LIMIT 50`,
      [assetId, companyId],
    );
  }

  async createConfigBackup(assetId: string, companyId: string, dto: any = {}) {
    await this.findOne(assetId, companyId);
    const configText = String(dto.configText || '');
    if (!configText.trim()) throw new BadRequestException('Config text is required');
    const checksum = crypto.createHash('sha256').update(configText).digest('hex');
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkConfigBackup (id, companyId, assetId, source, configText, checksum, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, assetId, dto.source || 'manual', configText, checksum, new Date()],
    );
    const rows = await this.prisma.query<any[]>(`SELECT id, companyId, assetId, source, checksum, createdAt FROM NetworkConfigBackup WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async diffConfigBackups(assetId: string, companyId: string, fromId?: string, toId?: string) {
    await this.findOne(assetId, companyId);
    const rows = await this.prisma.query<any[]>(
      `SELECT id, configText, createdAt FROM NetworkConfigBackup
       WHERE assetId = ? AND companyId = ?
       ORDER BY createdAt DESC LIMIT 2`,
      [assetId, companyId],
    );
    const selected = fromId && toId
      ? await this.prisma.query<any[]>(`SELECT id, configText, createdAt FROM NetworkConfigBackup WHERE assetId = ? AND companyId = ? AND id IN (?, ?)`, [assetId, companyId, fromId, toId])
      : rows;
    if (selected.length < 2) return { from: null, to: null, diff: [] };
    const [to, from] = selected.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { from: from.id, to: to.id, diff: this.lineDiff(from.configText || '', to.configText || '') };
  }

  async listEscalationPolicies(companyId: string) {
    return this.prisma.query(`SELECT * FROM NetworkEscalationPolicy WHERE companyId = ? ORDER BY createdAt DESC`, [companyId]);
  }

  async createEscalationPolicy(companyId: string, dto: any = {}, actorId?: string) {
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkEscalationPolicy
       (id, companyId, name, severity, firstDelayMin, secondDelayMin, managerDelayMin, enabled, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, dto.name || 'Default escalation', dto.severity || 'WARNING', Number(dto.firstDelayMin || 0), Number(dto.secondDelayMin || 15), Number(dto.managerDelayMin || 30), dto.enabled === false ? 0 : 1, new Date(), new Date()],
    );
    await this.auditNetworkChange(companyId, actorId, 'network.escalation.create', 'NetworkEscalationPolicy', id, dto);
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkEscalationPolicy WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async listSyslogSavedSearches(companyId: string) {
    return this.prisma.query(`SELECT * FROM NetworkSyslogSavedSearch WHERE companyId = ? ORDER BY createdAt DESC`, [companyId]);
  }

  async createSyslogSavedSearch(companyId: string, dto: any = {}) {
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkSyslogSavedSearch (id, companyId, name, query, severity, facility, assetId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, dto.name || 'Saved search', dto.query || null, dto.severity || null, dto.facility || null, dto.assetId || null, new Date()],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkSyslogSavedSearch WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async getRetentionPolicy(companyId: string) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkRetentionPolicy WHERE companyId = ? LIMIT 1`, [companyId]);
    return rows[0] || { companyId, snapshotDays: 30, syslogDays: 30, maxConcurrentPolls: 10, vendorBackoffSec: 300 };
  }

  async updateRetentionPolicy(companyId: string, dto: any = {}, actorId?: string) {
    const existing = await this.prisma.query<any[]>(`SELECT id FROM NetworkRetentionPolicy WHERE companyId = ? LIMIT 1`, [companyId]);
    if (existing[0]) {
      await this.prisma.execute(
        `UPDATE NetworkRetentionPolicy SET snapshotDays = ?, syslogDays = ?, maxConcurrentPolls = ?, vendorBackoffSec = ?, updatedAt = ? WHERE companyId = ?`,
        [Number(dto.snapshotDays || 30), Number(dto.syslogDays || 30), Number(dto.maxConcurrentPolls || 10), Number(dto.vendorBackoffSec || 300), new Date(), companyId],
      );
    } else {
      await this.prisma.execute(
        `INSERT INTO NetworkRetentionPolicy (id, companyId, snapshotDays, syslogDays, maxConcurrentPolls, vendorBackoffSec, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), companyId, Number(dto.snapshotDays || 30), Number(dto.syslogDays || 30), Number(dto.maxConcurrentPolls || 10), Number(dto.vendorBackoffSec || 300), new Date(), new Date()],
      );
    }
    await this.auditNetworkChange(companyId, actorId, 'network.retention.update', 'NetworkRetentionPolicy', companyId, dto);
    return this.getRetentionPolicy(companyId);
  }

  async listIpReservations(companyId: string) {
    return this.prisma.query(
      `SELECT * FROM NetworkIpReservation WHERE companyId = ? ORDER BY subnet ASC, ipAddress ASC LIMIT 500`,
      [companyId],
    );
  }

  async createIpReservation(companyId: string, dto: any = {}) {
    if (!dto.subnet || !dto.ipAddress) throw new BadRequestException('Subnet and IP address are required');
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkIpReservation (id, companyId, assetId, subnet, ipAddress, hostname, macAddress, status, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, dto.assetId || null, dto.subnet, dto.ipAddress, dto.hostname || null, dto.macAddress || null, dto.status || 'RESERVED', dto.notes || null, new Date()],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkIpReservation WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async scanSubnet(companyId: string, dto: any = {}) {
    const subnet = String(dto.subnet || '').trim();
    const hosts = this.expandIpv4Cidr(subnet).slice(0, Math.min(Number(dto.limit || 64), 254));
    if (hosts.length === 0) throw new BadRequestException('Provide an IPv4 CIDR subnet such as 192.168.1.0/24');
    const found: any[] = [];
    for (const host of hosts) {
      const online = await this.pingHost(host);
      if (!online) continue;
      const existing = await this.prisma.query<any[]>(`SELECT id FROM Asset WHERE companyId = ? AND ipAddress = ? AND deletedAt IS NULL LIMIT 1`, [companyId, host]);
      const id = crypto.randomUUID();
      await this.prisma.execute(
        `INSERT INTO NetworkDiscoveryResult (id, companyId, subnet, ipAddress, status, assetId, discoveredAt)
         VALUES (?, ?, ?, ?, 'FOUND', ?, ?)`,
        [id, companyId, subnet, host, existing[0]?.id || null, new Date()],
      );
      found.push({ id, subnet, ipAddress: host, status: 'FOUND', assetId: existing[0]?.id || null });
    }
    return found;
  }

  async listDiscoveryResults(companyId: string) {
    return this.prisma.query(
      `SELECT * FROM NetworkDiscoveryResult WHERE companyId = ? ORDER BY discoveredAt DESC LIMIT 250`,
      [companyId],
    );
  }

  listVendorMappings() {
    return Object.entries(this.vendorMappings()).map(([vendor, mapping]) => ({
      vendor,
      label: mapping.label,
      auth: mapping.auth,
      endpoints: mapping.endpoints,
      supported: mapping.supported,
    }));
  }

  async listNetworkCredentials(companyId: string) {
    const rows = await this.prisma.query<any[]>(
      `SELECT id, companyId, assetId, name, vendor, authMode, username, metadata, lastTestStatus, lastTestAt, createdAt, updatedAt
       FROM NetworkCredential WHERE companyId = ? ORDER BY createdAt DESC LIMIT 100`,
      [companyId],
    );
    return rows.map((row) => this.parseJsonFields(row, ['metadata']));
  }

  async createNetworkCredential(companyId: string, dto: any = {}, actorId?: string) {
    if (!dto.name) throw new BadRequestException('Credential name is required');
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkCredential
       (id, companyId, assetId, name, vendor, authMode, username, secret, metadata, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, companyId, dto.assetId || null, dto.name, dto.vendor || null, dto.authMode || 'API_KEY',
        dto.username || null, dto.secret ? this.encryptSecret(dto.secret) : null, JSON.stringify(dto.metadata || {}),
        new Date(), new Date(),
      ],
    );
    await this.auditNetworkChange(companyId, actorId, 'network.credential.create', 'NetworkCredential', id, { name: dto.name, vendor: dto.vendor });
    const rows = await this.prisma.query<any[]>(`SELECT id, companyId, assetId, name, vendor, authMode, username, metadata, lastTestStatus, lastTestAt, createdAt, updatedAt FROM NetworkCredential WHERE id = ? LIMIT 1`, [id]);
    return this.parseJsonFields(rows[0], ['metadata']);
  }

  async rotateNetworkCredential(id: string, companyId: string, dto: any = {}, actorId?: string) {
    if (!dto.secret) throw new BadRequestException('New secret is required');
    await this.prisma.execute(
      `UPDATE NetworkCredential SET secret = ?, updatedAt = ? WHERE id = ? AND companyId = ?`,
      [this.encryptSecret(dto.secret), new Date(), id, companyId],
    );
    await this.auditNetworkChange(companyId, actorId, 'network.credential.rotate', 'NetworkCredential', id);
    return { id, rotated: true };
  }

  async testNetworkCredential(id: string, companyId: string, actorId?: string) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkCredential WHERE id = ? AND companyId = ? LIMIT 1`, [id, companyId]);
    if (!rows[0]) throw new NotFoundException('Credential not found');
    const credential = rows[0];
    const status = credential.secret ? 'PASS' : 'FAIL';
    await this.prisma.execute(`UPDATE NetworkCredential SET lastTestStatus = ?, lastTestAt = ?, updatedAt = ? WHERE id = ?`, [status, new Date(), new Date(), id]);
    await this.auditNetworkChange(companyId, actorId, 'network.credential.test', 'NetworkCredential', id, { status });
    return { id, status };
  }

  async runVendorSync(assetId: string, companyId: string) {
    const asset = await this.findOne(assetId, companyId);
    const config = await this.getMonitoringConfigForPoll(assetId, companyId);
    const vendorKey = String(config?.vendor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const mapping = this.vendorMappings()[vendorKey];
    if (!mapping) throw new BadRequestException('Vendor mapping is not configured for this device');
    if (!config.vendorControllerUrl && mapping.requiresBaseUrl) throw new BadRequestException('Vendor controller URL is required');
    if (!config.vendorApiKey && mapping.requiresApiKey) throw new BadRequestException('Vendor API key is required');

    const result = await mapping.sync({ asset, config, request: (endpoint: string, init?: any) => this.vendorRequest(config, mapping, endpoint, init) });
    if (result.interfaces?.length) {
      await this.storeInterfaceMetrics(assetId, companyId, result.interfaces);
    }
    if (result.firmware) {
      await this.storeFirmwareInventory({ ...asset, manufacturer: result.firmware.vendor || asset.manufacturer, model: result.firmware.model || asset.model }, companyId, result.firmware.description || result.firmware.firmwareVersion || '');
    }
    const snapshot = await this.createNetworkSnapshot({
      companyId,
      assetId,
      status: result.status || 'ONLINE',
      interfaceStatus: result.interfaces || [],
      source: 'VENDOR_API',
      message: `${mapping.label} sync completed`,
    });
    await this.queueDeviceAction(assetId, companyId, { action: 'SYNC_CONTROLLER', payload: { vendor: mapping.label, status: result.status || 'ONLINE' } });
    return { snapshot, ...result };
  }

  async queueDeviceAction(assetId: string, companyId: string, dto: any = {}, requestedById?: string) {
    await this.findOne(assetId, companyId);
    const action = String(dto.action || '').toUpperCase();
    const allowed = ['RESTART', 'DISABLE_PORT', 'ENABLE_PORT', 'BOUNCE_POE', 'BACKUP_CONFIG', 'SYNC_CONTROLLER'];
    if (!allowed.includes(action)) throw new BadRequestException('Device action is not supported');
    const policyRows = await this.prisma.query<any[]>(
      `SELECT requireNetworkApproval FROM PlatformSecurityPolicy WHERE id = 'global-security-policy' LIMIT 1`,
    ).catch(() => []);
    const approvalRequired = Boolean(policyRows[0]?.requireNetworkApproval)
      && ['RESTART', 'DISABLE_PORT', 'BOUNCE_POE'].includes(action);
    const status = approvalRequired ? 'PENDING_APPROVAL' : 'QUEUED';
    const approvalStatus = approvalRequired ? 'PENDING' : 'NOT_REQUIRED';
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkDeviceAction
       (id, companyId, assetId, action, payload, status, approvalStatus, requestedById, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, assetId, action, JSON.stringify(dto.payload || {}), status, approvalStatus, requestedById || null, new Date()],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkDeviceAction WHERE id = ? LIMIT 1`, [id]);
    await this.auditNetworkChange(companyId, requestedById, 'network.action.queue', 'NetworkDeviceAction', id, { action });
    return this.parseJsonFields(rows[0], ['payload', 'result']);
  }

  async listDeviceActions(assetId: string, companyId: string) {
    await this.findOne(assetId, companyId);
    const rows = await this.prisma.query<any[]>(
      `SELECT * FROM NetworkDeviceAction WHERE assetId = ? AND companyId = ? ORDER BY createdAt DESC LIMIT 50`,
      [assetId, companyId],
    );
    return rows.map((row) => this.parseJsonFields(row, ['payload', 'result']));
  }

  async executeDeviceAction(assetId: string, actionId: string, companyId: string, actorId?: string) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkDeviceAction WHERE id = ? AND assetId = ? AND companyId = ? LIMIT 1`, [actionId, assetId, companyId]);
    if (!rows[0]) throw new NotFoundException('Device action not found');
    const action = this.parseJsonFields(rows[0], ['payload', 'result']);
    if (action.approvalStatus === 'PENDING' || action.status === 'PENDING_APPROVAL') {
      throw new BadRequestException('This disruptive action requires approval from another administrator');
    }
    if (action.approvalStatus === 'REJECTED' || action.status === 'REJECTED') {
      throw new BadRequestException('This action was rejected');
    }
    if (action.status !== 'QUEUED') {
      throw new BadRequestException('Only queued actions can be executed');
    }
    const config = await this.getMonitoringConfigForPoll(assetId, companyId);
    const vendorKey = String(config?.vendor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const mapping = this.vendorMappings()[vendorKey];
    let result: any = { message: 'Action recorded; no executable vendor mapping for this action' };
    let status = 'COMPLETED';
    try {
      if (mapping?.executeAction) {
        const asset = await this.findOne(assetId, companyId);
        result = await mapping.executeAction({ asset, config, action, request: (endpoint: string, init?: any) => this.vendorRequest(config, mapping, endpoint, init) });
      }
    } catch (err: any) {
      status = 'FAILED';
      result = { error: err?.message || 'Action failed' };
    }
    await this.prisma.execute(
      `UPDATE NetworkDeviceAction SET status = ?, result = ?, completedAt = ? WHERE id = ? AND companyId = ?`,
      [status, JSON.stringify(result), new Date(), actionId, companyId],
    );
    await this.auditNetworkChange(companyId, actorId, `network.action.${status.toLowerCase()}`, 'NetworkDeviceAction', actionId, { action: action.action, result });
    const updated = await this.prisma.query<any[]>(`SELECT * FROM NetworkDeviceAction WHERE id = ? LIMIT 1`, [actionId]);
    return this.parseJsonFields(updated[0], ['payload', 'result']);
  }

  async enrollWithToken(dto: any) {
    const token = String(dto.token || '').trim();
    if (!token) throw new BadRequestException('Enrollment token is required');

    const rows = await this.prisma.query<any[]>(
      `SELECT * FROM MdmEnrollmentToken WHERE token IN (?, ?) AND usedAt IS NULL AND expiresAt > NOW() LIMIT 1`,
      credentialLookupValues(token),
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
        mdmDeviceId: crypto.randomUUID(),
        mdmDeviceTokenHash: hashCredential(deviceToken),
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
      `SELECT c.*, a.mdmDeviceId, a.mdmDeviceTokenHash, a.companyId FROM MdmCommand c
       INNER JOIN Asset a ON a.id = c.assetId
       WHERE c.id = ?
       LIMIT 1`,
      [commandId],
    );
    const command = rows[0];
    if (!command || !credentialMatches(deviceToken, command.mdmDeviceTokenHash || command.mdmDeviceId)) {
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
    const [hashedToken, legacyToken] = credentialLookupValues(deviceToken);
    let sql = `SELECT * FROM Asset
      WHERE id = ?
        AND (mdmDeviceTokenHash = ? OR (mdmDeviceTokenHash IS NULL AND mdmDeviceId = ?))
        AND deletedAt IS NULL`;
    const params: any[] = [assetId, hashedToken, legacyToken];
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

  private async createNetworkSnapshot(input: any) {
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkHealthSnapshot
       (id, companyId, assetId, status, latencyMs, packetLossPct, uptimeSec, cpuPct, memoryPct,
        interfaceStatus, bandwidth, errors, source, message, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.companyId,
        input.assetId,
        input.status || 'UNKNOWN',
        input.latencyMs ?? null,
        input.packetLossPct ?? null,
        input.uptimeSec ?? null,
        input.cpuPct ?? null,
        input.memoryPct ?? null,
        input.interfaceStatus ? JSON.stringify(input.interfaceStatus) : null,
        input.bandwidth ? JSON.stringify(input.bandwidth) : null,
        input.errors ? JSON.stringify(input.errors) : null,
        input.source || 'PING',
        input.message || null,
        new Date(),
      ],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkHealthSnapshot WHERE id = ? LIMIT 1`, [id]);
    return this.parseNetworkSnapshot(rows[0]);
  }

  private async evaluateAlertRules(assetId: string, companyId: string, snapshot: any) {
    const rules = await this.listAlertRules(assetId, companyId);
    const matching = rules.filter((rule: any) => {
      if (!rule.enabled) return false;
      if (rule.metric === 'offline') return snapshot.status === 'OFFLINE';
      if (rule.metric === 'latency_ms') return this.compareNumber(snapshot.latencyMs, rule.operator, Number(rule.threshold));
      if (rule.metric === 'packet_loss_pct') return this.compareNumber(snapshot.packetLossPct, rule.operator, Number(rule.threshold));
      if (rule.metric === 'cpu_pct') return this.compareNumber(snapshot.cpuPct, rule.operator, Number(rule.threshold));
      if (rule.metric === 'memory_pct') return this.compareNumber(snapshot.memoryPct, rule.operator, Number(rule.threshold));
      return false;
    });

    if (snapshot.status === 'ONLINE') {
      await this.resolveInactiveAlerts(assetId, companyId);
    }

    if (matching.length === 0 || await this.isInMaintenanceWindow(assetId, companyId)) {
      return [];
    }

    const created = [];
    for (const rule of matching) {
      const existing = await this.prisma.query<any[]>(
        `SELECT * FROM NetworkAlertEvent WHERE assetId = ? AND companyId = ? AND ruleId = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED') LIMIT 1`,
        [assetId, companyId, rule.id],
      );
      if (existing[0]) {
        created.push(existing[0]);
        continue;
      }
      created.push(await this.createNetworkAlertEvent(assetId, companyId, rule, snapshot));
    }
    return created;
  }

  private async createNetworkAlertEvent(assetId: string, companyId: string, rule: any, snapshot: any) {
    const asset = await this.findOne(assetId, companyId);
    const title = `${asset.name}: ${rule.name}`;
    const details = [
      `Metric: ${rule.metric}`,
      `Threshold: ${rule.operator || 'GT'} ${rule.threshold || ''}`,
      `Status: ${snapshot.status}`,
      snapshot.latencyMs !== null && snapshot.latencyMs !== undefined ? `Latency: ${snapshot.latencyMs} ms` : '',
      snapshot.packetLossPct !== null && snapshot.packetLossPct !== undefined ? `Packet loss: ${snapshot.packetLossPct}%` : '',
      snapshot.message || '',
    ].filter(Boolean).join('\n');
    const id = crypto.randomUUID();
    const ticketId = await this.createAlertTicket(asset, rule, snapshot, details);

    await this.prisma.execute(
      `INSERT INTO NetworkAlertEvent (id, companyId, assetId, ruleId, snapshotId, ticketId, status, title, details, triggeredAt)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [id, companyId, assetId, rule.id, snapshot.id || null, ticketId, title, details, new Date()],
    );

    await this.sendAlertNotifications(companyId, title, details, ticketId, rule.notifyEmail);
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkAlertEvent WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  private async sendAlertNotifications(companyId: string, title: string, details: string, ticketId?: string | null, notifyEmail?: string) {
    const users = await this.prisma.query<any[]>(
      `SELECT id, email FROM User
       WHERE companyId = ? AND deletedAt IS NULL AND isActive = 1
         AND role IN ('SUPER_ADMIN', 'TENANT_ADMIN', 'TECHNICIAN')
       LIMIT 50`,
      [companyId],
    );
    const link = ticketId ? `/tickets/${ticketId}` : '/network';
    for (const user of users) {
      await this.notificationsService.create({
        userId: user.id,
        companyId,
        title,
        body: details,
        type: 'warning',
        link,
      }).catch(() => {});
    }
    if (notifyEmail) {
      await this.emailService.sendNotificationEmail(
        notifyEmail,
        title,
        `<p>${this.escapeHtml(details).replace(/\n/g, '<br>')}</p>`,
      ).catch(() => {});
    }
  }

  private async createAlertTicket(asset: any, rule: any, snapshot: any, details: string) {
    const existing = await this.prisma.query<any[]>(
      `SELECT id FROM Ticket
       WHERE companyId = ? AND assetId = ? AND status NOT IN ('RESOLVED', 'CLOSED')
         AND category = 'Network Monitoring' AND subcategory = ?
       ORDER BY createdAt DESC LIMIT 1`,
      [asset.companyId, asset.id, rule.metric],
    );
    if (existing[0]) return existing[0].id;

    const creator = await this.prisma.query<any[]>(
      `SELECT id, email, firstName, lastName, phone FROM User
       WHERE companyId = ? AND deletedAt IS NULL AND isActive = 1
       ORDER BY FIELD(role, 'TENANT_ADMIN', 'SUPER_ADMIN', 'TECHNICIAN', 'CLIENT'), createdAt ASC
       LIMIT 1`,
      [asset.companyId],
    );
    if (!creator[0]) return null;

    const countRows = await this.prisma.query<any[]>(`SELECT COUNT(*) as count FROM Ticket WHERE companyId = ?`, [asset.companyId]);
    const ticketNumber = `TKT-${asset.companyId.slice(0, 4).toUpperCase()}-${(Number(countRows[0]?.count || 0) + 1).toString().padStart(5, '0')}`;
    const ticketId = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO Ticket
       (id, ticketNumber, title, description, contactName, contactEmail, contactPhone, category, subcategory,
        location, status, priority, type, companyId, createdById, assetId, trackingToken, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Network Monitoring', ?, ?, 'OPEN', ?, 'INCIDENT', ?, ?, ?, ?, ?, ?)`,
      [
        ticketId,
        ticketNumber,
        `${asset.name}: ${rule.name}`,
        details,
        `${creator[0].firstName || ''} ${creator[0].lastName || ''}`.trim() || 'Network Monitor',
        creator[0].email || 'monitoring@fieldserviceit.local',
        creator[0].phone || 'N/A',
        rule.metric,
        asset.location || null,
        rule.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        asset.companyId,
        creator[0].id,
        asset.id,
        crypto.randomBytes(16).toString('hex'),
        new Date(),
        new Date(),
      ],
    );
    await this.participantNotifier.notify(ticketId, {
      action: 'Ticket opened by network monitoring',
      detail: details,
      actorId: creator[0].id,
    });
    return ticketId;
  }

  private async resolveInactiveAlerts(assetId: string, companyId: string) {
    const active = await this.prisma.query<any[]>(
      `SELECT * FROM NetworkAlertEvent WHERE assetId = ? AND companyId = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED')`,
      [assetId, companyId],
    );
    await this.prisma.execute(
      `UPDATE NetworkAlertEvent SET status = 'RESOLVED', resolvedAt = ? WHERE assetId = ? AND companyId = ? AND status IN ('ACTIVE', 'ACKNOWLEDGED')`,
      [new Date(), assetId, companyId],
    );
    for (const alert of active) {
      await this.sendAlertNotifications(companyId, `Recovered: ${alert.title}`, 'The monitored device is back online and the alert has been resolved.', alert.ticketId);
    }
  }

  private async isInMaintenanceWindow(assetId: string, companyId: string) {
    const rows = await this.prisma.query<any[]>(
      `SELECT id FROM NetworkMaintenanceWindow
       WHERE companyId = ? AND suppressAlerts = 1 AND startsAt <= NOW() AND endsAt >= NOW()
         AND (assetId = ? OR assetId IS NULL)
       LIMIT 1`,
      [companyId, assetId],
    );
    return Boolean(rows[0]);
  }

  private escapeHtml(value: string) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private compareNumber(value: any, operator: string, threshold: number) {
    const current = Number(value);
    if (!Number.isFinite(current) || !Number.isFinite(threshold)) return false;
    if (operator === 'LT') return current < threshold;
    if (operator === 'EQ') return current === threshold;
    return current > threshold;
  }

  private parseNetworkSnapshot(row: any) {
    if (!row) return row;
    for (const field of ['interfaceStatus', 'bandwidth', 'errors']) {
      if (typeof row[field] === 'string') {
        try { row[field] = JSON.parse(row[field]); } catch { /* ignore */ }
      }
    }
    return row;
  }

  private parseMonitoringConfig(row: any) {
    if (!row) return row;
    return {
      ...row,
      pingEnabled: Boolean(row.pingEnabled),
      snmpEnabled: Boolean(row.snmpEnabled),
      syslogEnabled: Boolean(row.syslogEnabled),
      snmpCommunity: row.snmpCommunity ? '********' : '',
      vendorApiKey: row.vendorApiKey ? '********' : '',
    };
  }

  private defaultMonitoringConfig(assetId: string, companyId: string) {
    return {
      id: '',
      companyId,
      assetId,
      pingEnabled: true,
      pingIntervalSec: 60,
      snmpEnabled: false,
      snmpVersion: '2c',
      snmpCommunity: '',
      snmpUsername: '',
      snmpAuthProtocol: '',
      snmpPrivacyProtocol: '',
      syslogEnabled: false,
      syslogPort: 514,
      vendor: '',
      vendorControllerUrl: '',
      vendorSiteId: '',
      vendorApiKey: '',
    };
  }

  private normalizeMonitoringConfig(dto: any) {
    return {
      pingEnabled: dto.pingEnabled === false ? 0 : 1,
      pingIntervalSec: Math.max(15, Math.min(3600, Number(dto.pingIntervalSec || 60))),
      snmpEnabled: dto.snmpEnabled ? 1 : 0,
      snmpVersion: dto.snmpVersion || '2c',
      snmpCommunity: dto.snmpCommunity && dto.snmpCommunity !== '********' ? this.encryptSecret(dto.snmpCommunity) : dto.snmpCommunity === '********' ? undefined : null,
      snmpUsername: dto.snmpUsername || null,
      snmpAuthProtocol: dto.snmpAuthProtocol || null,
      snmpPrivacyProtocol: dto.snmpPrivacyProtocol || null,
      syslogEnabled: dto.syslogEnabled ? 1 : 0,
      syslogPort: Math.max(1, Math.min(65535, Number(dto.syslogPort || 514))),
      vendor: dto.vendor || null,
      vendorControllerUrl: dto.vendorControllerUrl || null,
      vendorSiteId: dto.vendorSiteId || null,
      vendorApiKey: dto.vendorApiKey && dto.vendorApiKey !== '********' ? this.encryptSecret(dto.vendorApiKey) : dto.vendorApiKey === '********' ? undefined : null,
    };
  }

  private normalizeAlertRule(dto: any, partial = false) {
    const data: any = {};
    const set = (key: string, value: any) => {
      if (value !== undefined || !partial) data[key] = value;
    };
    set('name', dto.name || (partial ? undefined : 'Network alert'));
    set('metric', dto.metric || (partial ? undefined : 'offline'));
    set('operator', dto.operator || (partial ? undefined : 'GT'));
    set('threshold', dto.threshold ?? (partial ? undefined : '0'));
    set('durationSec', dto.durationSec === undefined ? (partial ? undefined : 300) : Math.max(0, Number(dto.durationSec)));
    set('severity', dto.severity || (partial ? undefined : 'WARNING'));
    set('enabled', dto.enabled === undefined ? (partial ? undefined : 1) : dto.enabled ? 1 : 0);
    set('notifyEmail', dto.notifyEmail || null);
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    return data;
  }

  private parsePingLatency(output: string) {
    const match = output.match(/time[=<]\s*(\d+(?:\.\d+)?)\s*ms/i) || output.match(/Average = (\d+)ms/i);
    return match ? Math.round(Number(match[1])) : null;
  }

  private parsePacketLoss(output: string) {
    const match = output.match(/(\d+(?:\.\d+)?)%\s*(?:packet )?loss/i) || output.match(/Lost = \d+ \((\d+)% loss\)/i);
    return match ? Number(match[1]) : null;
  }

  private async getMonitoringConfigForPoll(assetId: string, companyId: string) {
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkMonitoringConfig WHERE assetId = ? AND companyId = ? LIMIT 1`, [assetId, companyId]);
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      pingEnabled: Boolean(row.pingEnabled),
      snmpEnabled: Boolean(row.snmpEnabled),
      syslogEnabled: Boolean(row.syslogEnabled),
      snmpCommunity: this.decryptSecret(row.snmpCommunity),
      vendorApiKey: this.decryptSecret(row.vendorApiKey),
    };
  }

  private vendorMappings(): Record<string, any> {
    return {
      meraki: {
        label: 'Cisco Meraki',
        auth: 'X-Cisco-Meraki-API-Key',
        requiresBaseUrl: false,
        requiresApiKey: true,
        supported: ['device', 'switchPorts', 'uplinks', 'firmware'],
        endpoints: {
          baseUrl: 'https://api.meraki.com/api/v1',
          device: '/devices/{serial}',
          switchPorts: '/devices/{serial}/switch/ports/statuses',
          uplinks: '/devices/{serial}/appliance/uplinks/statuses',
        },
        sync: async ({ asset, request }: any) => {
          if (!asset.serialNumber) throw new BadRequestException('Meraki sync requires the device serial number');
          const device = await request(`/devices/${encodeURIComponent(asset.serialNumber)}`).catch(() => null);
          const ports = await request(`/devices/${encodeURIComponent(asset.serialNumber)}/switch/ports/statuses`).catch(() => []);
          return {
            status: device?.lanIp || device?.wan1Ip ? 'ONLINE' : 'UNKNOWN',
            firmware: {
              vendor: 'Cisco Meraki',
              model: device?.model,
              firmwareVersion: device?.firmware,
              description: JSON.stringify(device || {}),
            },
            interfaces: (Array.isArray(ports) ? ports : []).map((port: any, index: number) => ({
              ifIndex: Number(port.portId || index + 1),
              name: `Port ${port.portId || index + 1}`,
              status: port.enabled === false ? 'DISABLED' : port.status?.toUpperCase?.() || (port.isUplink ? 'UP' : 'UNKNOWN'),
              speedMbps: port.speed ? Number(String(port.speed).replace(/[^0-9]/g, '')) : null,
              vlan: port.vlan !== undefined ? String(port.vlan) : undefined,
              connectedMac: port.clientMac || port.cdp?.deviceId || port.lldp?.systemName,
              inErrors: Number(port.errors || 0),
              outErrors: Number(port.warnings || 0),
            })),
          };
        },
        executeAction: async ({ asset, action, request }: any) => {
          if (!asset.serialNumber) throw new BadRequestException('Meraki action requires serial number');
          if (action.action === 'BOUNCE_POE') {
            const portId = action.payload?.portId || action.payload?.port || '1';
            return request(`/devices/${encodeURIComponent(asset.serialNumber)}/switch/ports/${encodeURIComponent(portId)}/cycle`, { method: 'POST' });
          }
          if (action.action === 'SYNC_CONTROLLER') return { synced: true };
          throw new BadRequestException('Meraki action mapping is not available for this action');
        },
      },
      mikrotik: {
        label: 'MikroTik RouterOS',
        auth: 'Basic or Bearer via API key field',
        requiresBaseUrl: true,
        requiresApiKey: false,
        supported: ['interfaces', 'resources', 'firmware', 'actions'],
        endpoints: {
          resource: '/rest/system/resource',
          routerboard: '/rest/system/routerboard',
          interfaces: '/rest/interface',
        },
        sync: async ({ request }: any) => {
          const resource = await request('/rest/system/resource').catch(() => ({}));
          const routerboard = await request('/rest/system/routerboard').catch(() => ({}));
          const interfaces = await request('/rest/interface').catch(() => []);
          return {
            status: 'ONLINE',
            firmware: {
              vendor: 'MikroTik',
              model: routerboard?.model || resource?.platform,
              firmwareVersion: routerboard?.['current-firmware'] || resource?.version,
              description: JSON.stringify({ resource, routerboard }),
            },
            interfaces: (Array.isArray(interfaces) ? interfaces : []).map((iface: any, index: number) => ({
              ifIndex: Number(iface['.id']?.replace(/[^0-9]/g, '') || index + 1),
              name: iface.name,
              status: iface.running === 'true' || iface.running === true ? 'UP' : 'DOWN',
              speedMbps: iface['actual-mtu'] ? null : undefined,
              inErrors: Number(iface['rx-error'] || 0),
              outErrors: Number(iface['tx-error'] || 0),
            })),
          };
        },
        executeAction: async ({ action, request }: any) => {
          if (action.action === 'RESTART') return request('/rest/system/reboot', { method: 'POST' });
          if (action.action === 'DISABLE_PORT' || action.action === 'ENABLE_PORT') {
            const port = action.payload?.port || action.payload?.name;
            if (!port) throw new BadRequestException('Port name is required');
            return request(`/rest/interface/${encodeURIComponent(port)}`, {
              method: 'PATCH',
              body: JSON.stringify({ disabled: action.action === 'DISABLE_PORT' ? 'true' : 'false' }),
              headers: { 'Content-Type': 'application/json' },
            });
          }
          if (action.action === 'SYNC_CONTROLLER') return { synced: true };
          throw new BadRequestException('MikroTik action mapping is not available for this action');
        },
      },
      fortinet: {
        label: 'Fortinet FortiGate',
        auth: 'Bearer token',
        requiresBaseUrl: true,
        requiresApiKey: true,
        supported: ['systemStatus', 'interfaces', 'firmware'],
        endpoints: {
          status: '/api/v2/monitor/system/status',
          interfaces: '/api/v2/monitor/system/interface',
        },
        sync: async ({ request }: any) => {
          const status = await request('/api/v2/monitor/system/status').catch(() => ({}));
          const ifaceResult = await request('/api/v2/monitor/system/interface').catch(() => ({}));
          const values = Array.isArray(ifaceResult?.results) ? ifaceResult.results : Object.values(ifaceResult?.results || {});
          return {
            status: 'ONLINE',
            firmware: {
              vendor: 'Fortinet',
              model: status?.model_name || status?.model,
              firmwareVersion: status?.version || status?.firmware_version,
              description: JSON.stringify(status || {}),
            },
            interfaces: values.map((iface: any, index: number) => ({
              ifIndex: index + 1,
              name: iface.name || iface.interface,
              status: String(iface.link || iface.status || '').toLowerCase().includes('up') ? 'UP' : 'DOWN',
              speedMbps: Number(iface.speed || 0) || null,
              inOctets: Number(iface.rx_bytes || 0),
              outOctets: Number(iface.tx_bytes || 0),
              inErrors: Number(iface.rx_errors || 0),
              outErrors: Number(iface.tx_errors || 0),
            })),
          };
        },
        executeAction: async ({ action, request }: any) => {
          if (action.action === 'RESTART') return request('/api/v2/monitor/system/os/reboot', { method: 'POST' });
          if (action.action === 'SYNC_CONTROLLER') return { synced: true };
          throw new BadRequestException('Fortinet action mapping is not available for this action');
        },
      },
      unifi: this.configurableVendorMapping('UniFi Network', {
        devices: '/proxy/network/integration/v1/sites/{siteId}/devices',
      }),
      omada: this.configurableVendorMapping('TP-Link Omada', {
        devices: '/openapi/v1/{siteId}/devices',
      }),
      sonicwall: this.configurableVendorMapping('SonicWall', {
        interfaces: '/api/sonicos/interfaces',
      }),
      cisco: this.configurableVendorMapping('Cisco IOS/Catalyst', {
        interfaces: '/restconf/data/ietf-interfaces:interfaces-state',
      }),
    };
  }

  private configurableVendorMapping(label: string, endpoints: Record<string, string>) {
    return {
      label,
      auth: 'Bearer token',
      requiresBaseUrl: true,
      requiresApiKey: true,
      supported: ['configurableEndpoints', 'firmware', 'interfaces'],
      endpoints,
      sync: async ({ config, request }: any) => {
        const siteId = encodeURIComponent(config.vendorSiteId || 'default');
        const deviceEndpoint = Object.values(endpoints)[0].replace('{siteId}', siteId);
        const payload = await request(deviceEndpoint).catch(() => null);
        const items = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.results) ? payload.results : [];
        return {
          status: items.length > 0 ? 'ONLINE' : 'UNKNOWN',
          firmware: {
            vendor: label,
            firmwareVersion: items[0]?.firmwareVersion || items[0]?.version || items[0]?.firmware,
            model: items[0]?.model,
            description: JSON.stringify(payload || {}),
          },
          interfaces: items.flatMap((item: any, deviceIndex: number) => {
            const ports = item.ports || item.interfaces || item.port_table || [];
            return (Array.isArray(ports) ? ports : []).map((port: any, portIndex: number) => ({
              ifIndex: deviceIndex * 1000 + portIndex + 1,
              name: port.name || port.port || port.id || `Port ${portIndex + 1}`,
              status: String(port.status || port.state || '').toUpperCase() || 'UNKNOWN',
              speedMbps: Number(port.speed || port.speedMbps || 0) || null,
              vlan: port.vlan !== undefined ? String(port.vlan) : undefined,
              connectedMac: port.mac || port.clientMac || port.connectedMac,
              inErrors: Number(port.rxErrors || port.inErrors || 0),
              outErrors: Number(port.txErrors || port.outErrors || 0),
            }));
          }),
        };
      },
    };
  }

  private async vendorRequest(config: any, mapping: any, endpoint: string, init: any = {}) {
    const baseUrl = (config.vendorControllerUrl || mapping.endpoints.baseUrl || '').replace(/\/$/, '');
    const url = `${baseUrl}${endpoint}`;
    const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers || {}) };
    if (mapping.label === 'Cisco Meraki') headers['X-Cisco-Meraki-API-Key'] = config.vendorApiKey;
    else if (config.vendorApiKey) headers.Authorization = config.vendorApiKey.startsWith('Basic ') || config.vendorApiKey.startsWith('Bearer ') ? config.vendorApiKey : `Bearer ${config.vendorApiKey}`;
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) throw new BadRequestException(`${mapping.label} API request failed: ${response.status}`);
    return response.json();
  }

  private createSnmpSession(host: string, config: any) {
    if (String(config.snmpVersion || '2c').toLowerCase() === '3') {
      return snmp.createV3Session(host, {
        name: config.snmpUsername || '',
        level: snmp.SecurityLevel.noAuthNoPriv,
      }, { timeout: 3000, retries: 1 });
    }
    return snmp.createSession(host, config.snmpCommunity || 'public', {
      version: snmp.Version2c,
      timeout: 3000,
      retries: 1,
    });
  }

  private snmpGet(session: any, oids: string[]) {
    return new Promise<any[]>((resolve, reject) => {
      session.get(oids, (err: Error, varbinds: any[]) => err ? reject(err) : resolve(varbinds || []));
    });
  }

  private snmpTableColumns(session: any, oid: string, columns: number[]) {
    return new Promise<any>((resolve, reject) => {
      session.tableColumns(oid, columns, 20, (err: Error, table: any) => err ? reject(err) : resolve(table || {}));
    });
  }

  private varbindValue(varbind: any) {
    if (!varbind || snmp.isVarbindError(varbind)) return null;
    if (Buffer.isBuffer(varbind.value)) return varbind.value.toString('utf8');
    return varbind.value;
  }

  private parseInterfaceTable(table: any) {
    return Object.entries(table || {}).map(([ifIndex, row]: [string, any]) => ({
      ifIndex: Number(ifIndex),
      name: Buffer.isBuffer(row[2]) ? row[2].toString('utf8') : String(row[2] || `Interface ${ifIndex}`),
      speedMbps: row[5] ? Math.round(Number(row[5]) / 1000000) : null,
      status: Number(row[8]) === 1 ? 'UP' : Number(row[8]) === 2 ? 'DOWN' : 'UNKNOWN',
      inOctets: row[10] ? Number(row[10]) : null,
      inErrors: row[14] ? Number(row[14]) : null,
      outOctets: row[16] ? Number(row[16]) : null,
      outErrors: row[20] ? Number(row[20]) : null,
    }));
  }

  private async storeInterfaceMetrics(assetId: string, companyId: string, interfaces: any[]) {
    for (const iface of interfaces) {
      await this.prisma.execute(
        `INSERT INTO NetworkInterfaceMetric
         (id, companyId, assetId, ifIndex, name, status, speedMbps, inOctets, outOctets, inErrors, outErrors, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(), companyId, assetId, iface.ifIndex, iface.name, iface.status, iface.speedMbps,
          iface.inOctets, iface.outOctets, iface.inErrors, iface.outErrors, new Date(),
        ],
      );
    }
  }

  private async storeFirmwareInventory(asset: any, companyId: string, sysDescr: string | null) {
    const version = this.extractFirmwareVersion(sysDescr || '');
    const id = crypto.randomUUID();
    await this.prisma.execute(
      `INSERT INTO NetworkFirmwareInventory
       (id, companyId, assetId, vendor, model, firmwareVersion, eolStatus, cveSummary, checkedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, asset.id, asset.manufacturer || null, asset.model || null, version, 'UNKNOWN', sysDescr || null, new Date()],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM NetworkFirmwareInventory WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  private extractFirmwareVersion(sysDescr: string) {
    const match = sysDescr.match(/(?:version|ver\.?|firmware|release)\s*[: ]\s*([A-Za-z0-9_.()/-]+)/i);
    return match?.[1] || sysDescr.slice(0, 120) || null;
  }

  private async pingHost(host: string) {
    try {
      const args = process.platform === 'win32' ? ['-n', '1', '-w', '800', host] : ['-c', '1', '-W', '1', host];
      await execFileAsync('ping', args, { timeout: 1500 });
      return true;
    } catch {
      return false;
    }
  }

  private expandIpv4Cidr(cidr: string) {
    const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
    if (!match) return [];
    const parts = match.slice(1, 5).map(Number);
    const prefix = Number(match[5]);
    if (parts.some((part) => part < 0 || part > 255) || prefix < 24 || prefix > 30) return [];
    const base = parts.reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    const network = base & mask;
    const total = 2 ** (32 - prefix);
    const hosts: string[] = [];
    for (let offset = 1; offset < total - 1; offset++) {
      const value = (network + offset) >>> 0;
      hosts.push([24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.'));
    }
    return hosts;
  }

  private parseJsonFields(row: any, fields: string[]) {
    if (!row) return row;
    for (const field of fields) {
      if (typeof row[field] === 'string') {
        try { row[field] = JSON.parse(row[field]); } catch { /* ignore */ }
      }
    }
    return row;
  }

  private lineDiff(before: string, after: string) {
    const oldLines = before.split(/\r?\n/);
    const newLines = after.split(/\r?\n/);
    const max = Math.max(oldLines.length, newLines.length);
    const diff = [];
    for (let i = 0; i < max; i++) {
      if (oldLines[i] === newLines[i]) {
        diff.push({ type: 'same', line: oldLines[i] || '' });
      } else {
        if (oldLines[i] !== undefined) diff.push({ type: 'removed', line: oldLines[i] });
        if (newLines[i] !== undefined) diff.push({ type: 'added', line: newLines[i] });
      }
    }
    return diff;
  }

  private async auditNetworkChange(companyId: string, actorId: string | undefined, action: string, resourceType: string, resourceId: string, diff?: any) {
    if (!actorId) return;
    await this.prisma.auditLog.create({
      data: {
        companyId,
        actorId,
        action,
        resourceType,
        resourceId,
        diff: diff ? JSON.stringify(diff) : undefined,
      },
    }).catch(() => {});
  }

  private secretKey() {
    return crypto.createHash('sha256').update(process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fieldserviceit-dev-key').digest();
  }

  private encryptSecret(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.secretKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `ENC:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptSecret(value?: string | null) {
    if (!value) return '';
    if (!value.startsWith('ENC:')) return value;
    try {
      const [, iv, tag, encrypted] = value.split(':');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.secretKey(), Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      return '';
    }
  }

  private parseSyslogMessage(raw: string) {
    const priorityMatch = raw.match(/^<(\d+)>/);
    const priority = priorityMatch ? Number(priorityMatch[1]) : null;
    const severityNames = ['EMERGENCY', 'ALERT', 'CRITICAL', 'ERROR', 'WARNING', 'NOTICE', 'INFO', 'DEBUG'];
    const facilityNames = ['kernel', 'user', 'mail', 'daemon', 'auth', 'syslog', 'lpr', 'news', 'uucp', 'clock', 'authpriv', 'ftp', 'ntp', 'audit', 'alert', 'clock2', 'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7'];
    const severity = priority === null ? 'INFO' : severityNames[priority % 8] || 'INFO';
    const facility = priority === null ? null : facilityNames[Math.floor(priority / 8)] || null;
    return {
      facility,
      severity,
      message: raw.replace(/^<\d+>/, '').trim(),
    };
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
