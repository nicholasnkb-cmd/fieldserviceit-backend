import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CurrentUser } from '../../common/types';
import { DatabaseService } from '../../database/database.service';

const LINK_TYPES = ['UPLINK', 'DOWNLINK', 'PEER', 'WAN', 'WIRELESS', 'DEPENDENCY'];
const LINK_STATUSES = ['ACTIVE', 'DEGRADED', 'DOWN', 'PLANNED'];
const SITE_TYPES = ['COMPANY', 'SITE', 'RACK', 'CLOSET', 'ROOM', 'ZONE'];

@Injectable()
export class TopologyService {
  private schemaReady?: Promise<void>;

  constructor(private db: DatabaseService) {}

  async summary(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const company = scope.companyId ? 'companyId = ? AND ' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    const [nodes, sites, links, latest, alerts, orphaned, discovery] = await Promise.all([
      this.count(`SELECT COUNT(*) as count FROM Asset WHERE ${company}deletedAt IS NULL AND assetType = 'NETWORK_DEVICE'`, values),
      this.optionalCount(`SELECT COUNT(*) as count FROM NetworkSite WHERE ${company}1=1`, values),
      this.count(`SELECT COUNT(*) as count FROM NetworkTopologyLink WHERE ${company}status <> 'DOWN'`, values),
      this.db.query<any[]>(
        `SELECT h.status, COUNT(*) as count
         FROM NetworkHealthSnapshot h
         INNER JOIN (
           SELECT assetId, MAX(createdAt) as createdAt FROM NetworkHealthSnapshot ${scope.companyId ? 'WHERE companyId = ?' : ''} GROUP BY assetId
         ) latest ON latest.assetId = h.assetId AND latest.createdAt = h.createdAt
         GROUP BY h.status`,
        values,
      ).catch(() => []),
      this.optionalCount(`SELECT COUNT(*) as count FROM NetworkAlertEvent WHERE ${company}status = 'ACTIVE'`, values),
      this.count(
        `SELECT COUNT(*) as count
         FROM Asset a
         LEFT JOIN NetworkTopologyLink l ON l.sourceAssetId = a.id OR l.targetAssetId = a.id
         WHERE ${scope.companyId ? 'a.companyId = ? AND ' : ''}a.deletedAt IS NULL AND a.assetType = 'NETWORK_DEVICE' AND l.id IS NULL`,
        values,
      ),
      this.optionalCount(`SELECT COUNT(*) as count FROM NetworkDiscoveryResult WHERE ${company}assetId IS NULL`, values),
    ]);
    const byHealth = latest.reduce<Record<string, number>>((acc, row) => {
      acc[row.status || 'UNKNOWN'] = Number(row.count || 0);
      return acc;
    }, {});
    return {
      nodes,
      sites,
      links,
      online: byHealth.ONLINE || 0,
      offline: byHealth.OFFLINE || 0,
      unknown: Math.max(0, nodes - Number(byHealth.ONLINE || 0) - Number(byHealth.OFFLINE || 0)),
      activeAlerts: alerts,
      orphanedNodes: orphaned,
      discoveriesToMap: discovery,
    };
  }

  async map(user: CurrentUser, query: { siteId?: string; search?: string }) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const clauses: string[] = ['a.deletedAt IS NULL', "a.assetType = 'NETWORK_DEVICE'"];
    const values: any[] = [];
    if (scope.companyId) {
      clauses.push('a.companyId = ?');
      values.push(scope.companyId);
    }
    if (query.siteId) {
      clauses.push('(a.location = (SELECT name FROM NetworkSite WHERE id = ? LIMIT 1) OR a.location = ?)');
      values.push(query.siteId, query.siteId);
    }
    if (query.search) {
      clauses.push('(a.name LIKE ? OR a.manufacturer LIKE ? OR a.model LIKE ? OR a.ipAddress LIKE ? OR a.location LIKE ?)');
      const term = `%${query.search.trim()}%`;
      values.push(term, term, term, term, term);
    }
    const nodes = await this.db.query<any[]>(
      `SELECT a.id, a.companyId, c.name as companyName, a.name, a.assetType, a.deviceCategory, a.manufacturer, a.model,
        a.location, a.ipAddress, a.macAddress, a.status, a.complianceStatus, a.lastCheckInAt,
        h.status as healthStatus, h.latencyMs, h.packetLossPct, h.source as healthSource, h.createdAt as healthAt,
        fw.firmwareVersion, fw.latestVersion, fw.eolStatus,
        COALESCE(alerts.activeAlerts, 0) as activeAlerts,
        COALESCE(tickets.openTickets, 0) as openTickets,
        COALESCE(ifaces.portCount, 0) as portCount,
        COALESCE(ifaces.downPorts, 0) as downPorts
       FROM Asset a
       LEFT JOIN Company c ON c.id = a.companyId
       LEFT JOIN (
         SELECT h1.* FROM NetworkHealthSnapshot h1
         INNER JOIN (
           SELECT assetId, MAX(createdAt) as createdAt FROM NetworkHealthSnapshot GROUP BY assetId
         ) h2 ON h2.assetId = h1.assetId AND h2.createdAt = h1.createdAt
       ) h ON h.assetId = a.id
       LEFT JOIN (
         SELECT f1.* FROM NetworkFirmwareInventory f1
         INNER JOIN (
           SELECT assetId, MAX(checkedAt) as checkedAt FROM NetworkFirmwareInventory GROUP BY assetId
         ) f2 ON f2.assetId = f1.assetId AND f2.checkedAt = f1.checkedAt
       ) fw ON fw.assetId = a.id
       LEFT JOIN (
         SELECT assetId, COUNT(*) as activeAlerts FROM NetworkAlertEvent WHERE status = 'ACTIVE' GROUP BY assetId
       ) alerts ON alerts.assetId = a.id
       LEFT JOIN (
         SELECT assetId, COUNT(*) as openTickets FROM Ticket WHERE deletedAt IS NULL AND status NOT IN ('RESOLVED', 'CLOSED') GROUP BY assetId
       ) tickets ON tickets.assetId = a.id
       LEFT JOIN (
         SELECT assetId, COUNT(*) as portCount, SUM(CASE WHEN status NOT IN ('up', 'UP', '1') THEN 1 ELSE 0 END) as downPorts
         FROM NetworkInterfaceMetric
         GROUP BY assetId
       ) ifaces ON ifaces.assetId = a.id
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.location ASC, a.name ASC
       LIMIT 250`,
      values,
    );
    const nodeIds = new Set(nodes.map((node) => node.id));
    const [manualLinks, inferredLinks, sites, discoveries] = await Promise.all([
      this.listLinks(scope),
      this.inferredLinks(scope),
      this.listSites(user),
      this.listDiscoveries(scope),
    ]);
    const links = [...manualLinks, ...inferredLinks].filter((link) => nodeIds.has(link.sourceAssetId) && nodeIds.has(link.targetAssetId));
    return {
      nodes: nodes.map((node, index) => this.mapNode(node, index)),
      links,
      sites,
      discoveries,
      generatedAt: new Date().toISOString(),
    };
  }

  async listSites(user: CurrentUser) {
    const scope = this.scopeFor(user);
    const where = scope.companyId ? 'WHERE companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    return this.db.query<any[]>(`SELECT * FROM NetworkSite ${where} ORDER BY type ASC, name ASC`, values).catch(() => []);
  }

  async createSite(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Site name is required');
    const type = this.normalizeOption(dto.type || 'SITE', SITE_TYPES, 'site type');
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO NetworkSite (id, companyId, name, parentId, type, address, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, companyId, name, dto.parentId || null, type, dto.address?.trim() || null, dto.notes?.trim() || null, new Date()],
    );
    return (await this.db.query<any[]>('SELECT * FROM NetworkSite WHERE id = ? LIMIT 1', [id]))[0];
  }

  async createLink(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    await this.assertAsset(companyId, dto.sourceAssetId, 'source');
    await this.assertAsset(companyId, dto.targetAssetId, 'target');
    if (dto.sourceAssetId === dto.targetAssetId) throw new BadRequestException('Source and target must be different devices');
    const id = randomUUID();
    const linkType = this.normalizeOption(dto.linkType || 'UPLINK', LINK_TYPES, 'link type');
    const status = this.normalizeOption(dto.status || 'ACTIVE', LINK_STATUSES, 'link status');
    await this.db.execute(
      `INSERT INTO NetworkTopologyLink
       (id, companyId, sourceAssetId, targetAssetId, sourceInterface, targetInterface, linkType, status, bandwidthMbps, discoveredBy, notes, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, companyId, dto.sourceAssetId, dto.targetAssetId, dto.sourceInterface?.trim() || null, dto.targetInterface?.trim() || null,
        linkType, status, Number(dto.bandwidthMbps) || null, dto.discoveredBy?.trim() || 'manual',
        dto.notes?.trim() || null, user.id, new Date(), new Date(),
      ],
    );
    return (await this.db.query<any[]>('SELECT * FROM NetworkTopologyLink WHERE id = ? LIMIT 1', [id]))[0];
  }

  async updateLink(user: CurrentUser, id: string, dto: any) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const values: any[] = [id];
    const companyClause = scope.companyId ? 'AND companyId = ?' : '';
    if (scope.companyId) values.push(scope.companyId);
    const rows = await this.db.query<any[]>(`SELECT * FROM NetworkTopologyLink WHERE id = ? ${companyClause} LIMIT 1`, values);
    if (!rows[0]) throw new NotFoundException('Topology link not found');
    const updates: Record<string, any> = {
      sourceInterface: Object.prototype.hasOwnProperty.call(dto, 'sourceInterface') ? dto.sourceInterface?.trim() || null : undefined,
      targetInterface: Object.prototype.hasOwnProperty.call(dto, 'targetInterface') ? dto.targetInterface?.trim() || null : undefined,
      linkType: dto.linkType ? this.normalizeOption(dto.linkType, LINK_TYPES, 'link type') : undefined,
      status: dto.status ? this.normalizeOption(dto.status, LINK_STATUSES, 'link status') : undefined,
      bandwidthMbps: Object.prototype.hasOwnProperty.call(dto, 'bandwidthMbps') ? Number(dto.bandwidthMbps) || null : undefined,
      notes: Object.prototype.hasOwnProperty.call(dto, 'notes') ? dto.notes?.trim() || null : undefined,
      updatedAt: new Date(),
    };
    const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
    await this.db.execute(`UPDATE NetworkTopologyLink SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ?`, [
      ...keys.map((key) => updates[key]),
      id,
    ]);
    return (await this.db.query<any[]>('SELECT * FROM NetworkTopologyLink WHERE id = ? LIMIT 1', [id]))[0];
  }

  private async listLinks(scope: { companyId: string | null }) {
    const where = scope.companyId ? 'WHERE l.companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    return this.db.query<any[]>(
      `SELECT l.*, s.name as sourceName, t.name as targetName
       FROM NetworkTopologyLink l
       LEFT JOIN Asset s ON s.id = l.sourceAssetId
       LEFT JOIN Asset t ON t.id = l.targetAssetId
       ${where}
       ORDER BY l.updatedAt DESC
       LIMIT 300`,
      values,
    );
  }

  private async inferredLinks(scope: { companyId: string | null }) {
    const where = scope.companyId ? 'WHERE i.companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    const rows = await this.db.query<any[]>(
      `SELECT i.companyId, i.assetId as sourceAssetId, peer.id as targetAssetId, i.name as sourceInterface,
        i.connectedMac, i.vlan, i.speedMbps
       FROM NetworkInterfaceMetric i
       INNER JOIN Asset peer ON peer.macAddress = i.connectedMac AND peer.deletedAt IS NULL
       ${where}
       ORDER BY i.createdAt DESC
       LIMIT 300`,
      values,
    ).catch(() => []);
    const seen = new Set<string>();
    return rows.filter((row) => {
      const key = [row.sourceAssetId, row.targetAssetId].sort().join(':');
      if (!row.sourceAssetId || !row.targetAssetId || row.sourceAssetId === row.targetAssetId || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((row) => ({
      id: `inferred-${row.sourceAssetId}-${row.targetAssetId}`,
      companyId: row.companyId,
      sourceAssetId: row.sourceAssetId,
      targetAssetId: row.targetAssetId,
      sourceInterface: row.sourceInterface,
      targetInterface: null,
      linkType: 'PEER',
      status: 'ACTIVE',
      bandwidthMbps: row.speedMbps,
      discoveredBy: 'interface-mac',
      notes: row.vlan ? `VLAN ${row.vlan}` : null,
      inferred: true,
    }));
  }

  private async listDiscoveries(scope: { companyId: string | null }) {
    const where = scope.companyId ? 'WHERE companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    return this.db.query<any[]>(
      `SELECT * FROM NetworkDiscoveryResult ${where} ORDER BY discoveredAt DESC LIMIT 100`,
      values,
    ).catch(() => []);
  }

  private mapNode(node: any, index: number) {
    const role = this.nodeRole(node);
    const col = index % 5;
    const row = Math.floor(index / 5);
    return {
      ...node,
      role,
      x: 120 + col * 220,
      y: 90 + row * 160,
      healthStatus: node.healthStatus || (node.status === 'active' ? 'ONLINE' : 'UNKNOWN'),
      impactScore: Number(node.activeAlerts || 0) * 5 + Number(node.openTickets || 0) * 2 + Number(node.downPorts || 0),
    };
  }

  private nodeRole(node: any) {
    const text = [node.name, node.manufacturer, node.model, node.deviceCategory, node.assetType].join(' ').toLowerCase();
    if (text.includes('firewall') || text.includes('sonicwall') || text.includes('fortinet')) return 'firewall';
    if (text.includes('router') || text.includes('gateway') || text.includes('wan')) return 'router';
    if (text.includes('switch')) return 'switch';
    if (text.includes('ap') || text.includes('wireless') || text.includes('wifi')) return 'ap';
    if (text.includes('controller') || text.includes('meraki') || text.includes('unifi') || text.includes('omada')) return 'controller';
    return 'device';
  }

  private scopeFor(user: CurrentUser) {
    if (user.companyId) return { companyId: user.companyId };
    if (user.role === 'SUPER_ADMIN') return { companyId: user.effectiveCompanyId || null };
    throw new ForbiddenException('Select a company context to view topology');
  }

  private resolveWriteCompany(user: CurrentUser, requestedCompanyId?: string) {
    if (user.companyId) return user.companyId;
    if (user.role === 'SUPER_ADMIN' && (user.effectiveCompanyId || requestedCompanyId)) return user.effectiveCompanyId || requestedCompanyId;
    throw new ForbiddenException('Select a company context before changing topology');
  }

  private async assertAsset(companyId: string, assetId: string, label: string) {
    const rows = await this.db.query<any[]>('SELECT id FROM Asset WHERE id = ? AND companyId = ? AND deletedAt IS NULL LIMIT 1', [assetId, companyId]);
    if (!rows[0]) throw new BadRequestException(`Topology ${label} device is not available`);
  }

  private async count(sql: string, values: any[]) {
    const rows = await this.db.query<any[]>(sql, values);
    return Number(rows[0]?.count || 0);
  }

  private async optionalCount(sql: string, values: any[]) {
    try {
      return await this.count(sql, values);
    } catch {
      return 0;
    }
  }

  private normalizeOption(value: string, allowed: string[], label: string) {
    const normalized = String(value || '').toUpperCase();
    if (!allowed.includes(normalized)) throw new BadRequestException(`Invalid ${label}`);
    return normalized;
  }

  private ensureSchema() {
    if (!this.schemaReady) this.schemaReady = this.createSchema();
    return this.schemaReady;
  }

  private async createSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS NetworkTopologyLink (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        sourceAssetId VARCHAR(191) NOT NULL,
        targetAssetId VARCHAR(191) NOT NULL,
        sourceInterface VARCHAR(191),
        targetInterface VARCHAR(191),
        linkType VARCHAR(32) DEFAULT 'UPLINK',
        status VARCHAR(32) DEFAULT 'ACTIVE',
        bandwidthMbps BIGINT,
        discoveredBy VARCHAR(64) DEFAULT 'manual',
        notes TEXT,
        createdById VARCHAR(191),
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId, status),
        INDEX(sourceAssetId),
        INDEX(targetAssetId),
        INDEX(linkType)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
  }
}
