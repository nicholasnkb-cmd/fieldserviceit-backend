import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CurrentUser } from '../../common/types';
import { DatabaseService } from '../../database/database.service';

const LINK_TYPES = ['UPLINK', 'DOWNLINK', 'PEER', 'WAN', 'WIRELESS', 'DEPENDENCY'];
const LINK_STATUSES = ['ACTIVE', 'DEGRADED', 'DOWN', 'PLANNED'];
const SITE_TYPES = ['COMPANY', 'SITE', 'RACK', 'CLOSET', 'ROOM', 'ZONE'];
const DEVICE_ACTIONS = ['RESTART', 'DISABLE_PORT', 'ENABLE_PORT', 'BOUNCE_POE', 'BACKUP_CONFIG', 'SYNC_CONTROLLER'];
const PORT_ACTIONS = ['DISABLE_PORT', 'ENABLE_PORT', 'BOUNCE_POE'];

type Scope = { companyId: string | null };

@Injectable()
export class TopologyService {
  private schemaReady?: Promise<void>;

  constructor(private db: DatabaseService) {}

  async summary(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const company = scope.companyId ? 'companyId = ? AND ' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    const [nodes, sites, links, latest, alerts, orphaned, discovery, openChanges, shares, settings] = await Promise.all([
      this.count(`SELECT COUNT(*) as count FROM Asset WHERE ${company}deletedAt IS NULL AND deviceCategory = 'NETWORK_DEVICE'`, values),
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
         WHERE ${scope.companyId ? 'a.companyId = ? AND ' : ''}a.deletedAt IS NULL AND a.deviceCategory = 'NETWORK_DEVICE' AND l.id IS NULL`,
        values,
      ),
      this.optionalCount(`SELECT COUNT(*) as count FROM NetworkDiscoveryResult WHERE ${company}assetId IS NULL`, values),
      this.optionalCount(`SELECT COUNT(*) as count FROM NetworkTopologyChange WHERE ${company}status = 'OPEN'`, values),
      this.optionalCount(`SELECT COUNT(*) as count FROM NetworkTopologyShare WHERE ${company}active = 1`, values),
      this.getSettings(scope),
    ]);
    const byHealth = (latest as any[]).reduce<Record<string, number>>((acc, row) => {
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
      openChanges,
      activeShares: shares,
      customerVisible: Boolean(settings.customerVisible),
      defaultOverlay: settings.defaultOverlay || 'health',
    };
  }

  async map(user: CurrentUser, query: { siteId?: string; search?: string }) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const clauses: string[] = ['a.deletedAt IS NULL', "a.deviceCategory = 'NETWORK_DEVICE'"];
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
      `SELECT a.id, a.companyId, c.name as companyName, a.name, a.deviceCategory, a.manufacturer, a.model,
        a.location, a.ipAddress, a.macAddress, a.status, a.complianceStatus, a.lastCheckInAt,
        h.status as healthStatus, h.latencyMs, h.packetLossPct, h.source as healthSource, h.createdAt as healthAt,
        fw.firmwareVersion, fw.latestVersion, fw.eolStatus,
        COALESCE(alerts.activeAlerts, 0) as activeAlerts,
        COALESCE(tickets.openTickets, 0) as openTickets,
        COALESCE(ifaces.portCount, 0) as portCount,
        COALESCE(ifaces.downPorts, 0) as downPorts,
        COALESCE(ifaces.errorPorts, 0) as errorPorts,
        COALESCE(ifaces.poeWatts, 0) as poeWatts,
        layout.x, layout.y
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
         SELECT assetId, COUNT(*) as portCount,
           SUM(CASE WHEN status NOT IN ('up', 'UP', '1') THEN 1 ELSE 0 END) as downPorts,
           SUM(CASE WHEN COALESCE(inErrors, 0) + COALESCE(outErrors, 0) > 0 THEN 1 ELSE 0 END) as errorPorts,
           SUM(COALESCE(poeWatts, 0)) as poeWatts
         FROM NetworkInterfaceMetric
         GROUP BY assetId
       ) ifaces ON ifaces.assetId = a.id
       LEFT JOIN NetworkTopologyLayout layout ON layout.assetId = a.id AND layout.companyId = a.companyId
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
    const [interfaces, actions, changes, settings, shares] = await Promise.all([
      this.listInterfaces(scope, Array.from(nodeIds)),
      this.listActions(scope, Array.from(nodeIds)),
      this.listChanges(scope),
      this.getSettings(scope),
      this.listShares(scope),
    ]);
    return {
      nodes: nodes.map((node, index) => this.mapNode(node, index)),
      links,
      sites,
      discoveries,
      interfaces,
      actions,
      changes,
      settings,
      shares,
      generatedAt: new Date().toISOString(),
    };
  }

  async listSites(user: CurrentUser) {
    const scope = this.scopeFor(user);
    const where = scope.companyId ? 'WHERE companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    return this.db.query<any[]>(`SELECT * FROM NetworkSite ${where} ORDER BY type ASC, name ASC`, values).catch(() => []);
  }

  async correlateAlerts(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const companyClause = scope.companyId ? 'e.companyId = ? AND ' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    const rows = await this.db.query<any[]>(
      `SELECT
         e.companyId,
         e.assetId,
         a.name as assetName,
         a.location,
         e.ruleId,
         e.title,
         COUNT(*) as alertCount,
         MIN(e.triggeredAt) as firstTriggeredAt,
         MAX(e.triggeredAt) as lastTriggeredAt,
         GROUP_CONCAT(e.id ORDER BY e.triggeredAt DESC SEPARATOR ',') as alertIds,
         MAX(e.ticketId) as linkedTicketId,
         t.ticketNumber as linkedTicketNumber,
         t.status as linkedTicketStatus
       FROM NetworkAlertEvent e
       LEFT JOIN Asset a ON a.id = e.assetId
       LEFT JOIN Ticket t ON t.id = e.ticketId
       WHERE ${companyClause}e.status = 'ACTIVE'
       GROUP BY e.companyId, e.assetId, a.name, a.location, e.ruleId, e.title, t.ticketNumber, t.status
       ORDER BY alertCount DESC, lastTriggeredAt DESC
       LIMIT 50`,
      values,
    ).catch(() => []);

    return rows.map((row) => ({
      companyId: row.companyId,
      assetId: row.assetId,
      assetName: row.assetName,
      location: row.location,
      ruleId: row.ruleId,
      title: row.title,
      alertCount: Number(row.alertCount || 0),
      firstTriggeredAt: row.firstTriggeredAt,
      lastTriggeredAt: row.lastTriggeredAt,
      alertIds: String(row.alertIds || '').split(',').filter(Boolean),
      linkedTicket: row.linkedTicketId ? {
        id: row.linkedTicketId,
        ticketNumber: row.linkedTicketNumber,
        status: row.linkedTicketStatus,
      } : null,
      recommendation: row.linkedTicketId
        ? 'Append new alert evidence to the linked ticket timeline.'
        : Number(row.alertCount || 0) > 1
          ? 'Create one incident ticket for this correlated alert group.'
          : 'Monitor or attach to an existing asset ticket.',
      impactScore: Number(row.alertCount || 0) * 5 + (row.location ? 2 : 0),
    }));
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
    await this.db.execute(`UPDATE NetworkTopologyLink SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ? AND companyId = ?`, [
      ...keys.map((key) => updates[key]),
      id,
      rows[0].companyId,
    ]);
    return (await this.db.query<any[]>('SELECT * FROM NetworkTopologyLink WHERE id = ? LIMIT 1', [id]))[0];
  }

  async saveLayout(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    const positions = Array.isArray(dto.positions) ? dto.positions : [];
    if (!positions.length) throw new BadRequestException('At least one node position is required');
    for (const item of positions.slice(0, 300)) {
      await this.assertAsset(companyId, item.assetId, 'layout');
      await this.db.execute(
        `INSERT INTO NetworkTopologyLayout (id, companyId, assetId, x, y, locked, updatedById, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE x = VALUES(x), y = VALUES(y), locked = VALUES(locked), updatedById = VALUES(updatedById), updatedAt = VALUES(updatedAt)`,
        [randomUUID(), companyId, item.assetId, Math.max(0, Math.round(Number(item.x) || 0)), Math.max(0, Math.round(Number(item.y) || 0)), item.locked === false ? 0 : 1, user.id, new Date()],
      );
    }
    return { saved: Math.min(positions.length, 300) };
  }

  async resetLayout(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    await this.db.execute('DELETE FROM NetworkTopologyLayout WHERE companyId = ?', [companyId]);
    return { reset: true };
  }

  async updateSettings(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    const defaultOverlay = ['health', 'utilization', 'errors', 'poe', 'alerts'].includes(dto.defaultOverlay) ? dto.defaultOverlay : 'health';
    await this.db.execute(
      `INSERT INTO NetworkTopologySetting (id, companyId, customerVisible, shareEnabled, defaultOverlay, updatedById, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE customerVisible = VALUES(customerVisible), shareEnabled = VALUES(shareEnabled), defaultOverlay = VALUES(defaultOverlay), updatedById = VALUES(updatedById), updatedAt = VALUES(updatedAt)`,
      [randomUUID(), companyId, dto.customerVisible ? 1 : 0, dto.shareEnabled === false ? 0 : 1, defaultOverlay, user.id, new Date()],
    );
    return this.getSettings({ companyId });
  }

  async createShare(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    const settings = await this.getSettings({ companyId });
    if (settings.shareEnabled === false) throw new BadRequestException('Topology sharing is disabled for this company');
    const id = randomUUID();
    const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '').slice(0, 12);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    await this.db.execute(
      `INSERT INTO NetworkTopologyShare (id, companyId, token, name, siteId, expiresAt, active, createdById, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, companyId, token, dto.name?.trim() || 'Customer topology share', dto.siteId || null, expiresAt, user.id, new Date()],
    );
    return (await this.db.query<any[]>('SELECT id, companyId, token, name, siteId, expiresAt, active, createdAt FROM NetworkTopologyShare WHERE id = ? LIMIT 1', [id]))[0];
  }

  async publicShare(token: string) {
    await this.ensureSchema();
    const rows = await this.db.query<any[]>(
      'SELECT * FROM NetworkTopologyShare WHERE token = ? AND active = 1 AND (expiresAt IS NULL OR expiresAt > NOW()) LIMIT 1',
      [token],
    );
    if (!rows[0]) throw new NotFoundException('Shared topology map not found');
    const settings = await this.getSettings({ companyId: rows[0].companyId });
    if (!settings.customerVisible) throw new NotFoundException('Shared topology map is not available');
    const map = await this.map({ id: 'share', role: 'SUPER_ADMIN', effectiveCompanyId: rows[0].companyId } as CurrentUser, { siteId: rows[0].siteId || undefined });
    return {
      name: rows[0].name,
      expiresAt: rows[0].expiresAt,
      nodes: map.nodes.map(({ id, name, role, location, healthStatus, activeAlerts, x, y }: any) => ({ id, name, role, location, healthStatus, activeAlerts, x, y })),
      links: map.links.map(({ id, sourceAssetId, targetAssetId, linkType, status, inferred }: any) => ({ id, sourceAssetId, targetAssetId, linkType, status, inferred })),
      generatedAt: map.generatedAt,
    };
  }

  async queueAction(user: CurrentUser, assetId: string, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    await this.assertAsset(companyId, assetId, 'action');
    const action = this.normalizeOption(dto.action, DEVICE_ACTIONS, 'device action');
    const payload = dto.payload && typeof dto.payload === 'object' ? dto.payload : {};
    if (PORT_ACTIONS.includes(action) && !String(payload.port || '').trim()) {
      throw new BadRequestException('Port is required for this topology action');
    }
    const policyRows = await this.db.query<any[]>(
      `SELECT requireNetworkApproval FROM PlatformSecurityPolicy WHERE id = 'global-security-policy' LIMIT 1`,
    ).catch(() => []);
    const approvalRequired = Boolean(policyRows[0]?.requireNetworkApproval)
      && ['RESTART', 'DISABLE_PORT', 'BOUNCE_POE'].includes(action);
    const status = approvalRequired ? 'PENDING_APPROVAL' : 'QUEUED';
    const approvalStatus = approvalRequired ? 'PENDING' : 'NOT_REQUIRED';
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO NetworkDeviceAction
       (id, companyId, assetId, action, payload, status, approvalStatus, requestedById, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, companyId, assetId, action,
        JSON.stringify({ ...payload, source: 'topology-map', safety: approvalRequired ? 'pending-independent-approval' : 'queued-for-execution' }),
        status, approvalStatus, user.id, new Date(),
      ],
    );
    return (await this.db.query<any[]>('SELECT * FROM NetworkDeviceAction WHERE id = ? LIMIT 1', [id]))[0];
  }

  async detectChanges(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    if (!scope.companyId) throw new ForbiddenException('Select a company context before detecting topology changes');
    const [discoveries, links] = await Promise.all([this.listDiscoveries(scope), this.listLinks(scope)]);
    let created = 0;
    for (const item of discoveries.filter((entry) => !entry.assetId).slice(0, 100)) {
      created += await this.insertChange(scope.companyId, 'UNMAPPED_DISCOVERY', 'NetworkDiscoveryResult', item.id, `Unmapped network discovery: ${item.hostname || item.ipAddress}`, item);
    }
    for (const link of links.filter((entry) => ['DOWN', 'DEGRADED'].includes(entry.status)).slice(0, 100)) {
      created += await this.insertChange(scope.companyId, `LINK_${link.status}`, 'NetworkTopologyLink', link.id, `${link.sourceName || 'Source'} to ${link.targetName || 'Target'} is ${link.status.toLowerCase()}`, link);
    }
    return { created, changes: await this.listChanges(scope) };
  }

  private async listLinks(scope: Scope) {
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

  private async inferredLinks(scope: Scope) {
    const where = scope.companyId ? 'WHERE i.companyId = ?' : 'WHERE 1=1';
    const values = scope.companyId ? [scope.companyId] : [];
    const rows = await this.db.query<any[]>(
      `SELECT i.companyId, i.assetId as sourceAssetId, COALESCE(i.neighborAssetId, peer.id) as targetAssetId,
        i.name as sourceInterface, i.connectedMac, i.vlan, i.speedMbps, i.neighborProtocol, i.neighborPort
       FROM NetworkInterfaceMetric i
       LEFT JOIN Asset peer ON peer.macAddress = i.connectedMac AND peer.deletedAt IS NULL
       ${where}
       AND (i.neighborAssetId IS NOT NULL OR peer.id IS NOT NULL)
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
      targetInterface: row.neighborPort || null,
      linkType: 'PEER',
      status: 'ACTIVE',
      bandwidthMbps: row.speedMbps,
      discoveredBy: row.neighborProtocol || 'interface-mac',
      notes: [row.vlan ? `VLAN ${row.vlan}` : null, row.neighborProtocol ? `via ${row.neighborProtocol}` : null].filter(Boolean).join(' | ') || null,
      inferred: true,
    }));
  }

  private async listDiscoveries(scope: Scope) {
    const where = scope.companyId ? 'WHERE companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    return this.db.query<any[]>(
      `SELECT * FROM NetworkDiscoveryResult ${where} ORDER BY discoveredAt DESC LIMIT 100`,
      values,
    ).catch(() => []);
  }

  private async listInterfaces(scope: Scope, assetIds: string[]) {
    if (!assetIds.length) return [];
    const where = scope.companyId ? 'AND i.companyId = ?' : '';
    const values = [...assetIds, ...(scope.companyId ? [scope.companyId] : [])];
    return this.db.query<any[]>(
      `SELECT i.*
       FROM NetworkInterfaceMetric i
       INNER JOIN (
         SELECT assetId, ifIndex, MAX(createdAt) as createdAt
         FROM NetworkInterfaceMetric
         WHERE assetId IN (${assetIds.map(() => '?').join(',')})
         GROUP BY assetId, ifIndex
       ) latest ON latest.assetId = i.assetId AND latest.ifIndex = i.ifIndex AND latest.createdAt = i.createdAt
       WHERE 1=1 ${where}
       ORDER BY i.assetId, i.ifIndex
       LIMIT 750`,
      values,
    ).catch(() => []);
  }

  private async listActions(scope: Scope, assetIds: string[]) {
    if (!assetIds.length) return [];
    const where = scope.companyId ? 'AND companyId = ?' : '';
    const values = [...assetIds, ...(scope.companyId ? [scope.companyId] : [])];
    return this.db.query<any[]>(
      `SELECT * FROM NetworkDeviceAction
       WHERE assetId IN (${assetIds.map(() => '?').join(',')}) ${where}
       ORDER BY createdAt DESC
       LIMIT 100`,
      values,
    ).catch(() => []);
  }

  private async listChanges(scope: Scope) {
    const where = scope.companyId ? 'WHERE companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    return this.db.query<any[]>(`SELECT * FROM NetworkTopologyChange ${where} ORDER BY detectedAt DESC LIMIT 100`, values).catch(() => []);
  }

  private async listShares(scope: Scope) {
    const where = scope.companyId ? 'WHERE companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    return this.db.query<any[]>(
      `SELECT id, companyId, token, name, siteId, expiresAt, active, createdAt FROM NetworkTopologyShare ${where} ORDER BY createdAt DESC LIMIT 25`,
      values,
    ).catch(() => []);
  }

  private async getSettings(scope: Scope) {
    if (!scope.companyId) return { customerVisible: false, shareEnabled: true, defaultOverlay: 'health' };
    const rows = await this.db.query<any[]>('SELECT * FROM NetworkTopologySetting WHERE companyId = ? LIMIT 1', [scope.companyId]).catch(() => []);
    return rows[0] || { companyId: scope.companyId, customerVisible: false, shareEnabled: true, defaultOverlay: 'health' };
  }

  private async insertChange(companyId: string, changeType: string, sourceType: string, sourceId: string, title: string, details: any) {
    const existing = await this.db.query<any[]>(
      'SELECT id FROM NetworkTopologyChange WHERE companyId = ? AND changeType = ? AND sourceId = ? AND status = ? LIMIT 1',
      [companyId, changeType, sourceId, 'OPEN'],
    );
    if (existing[0]) return 0;
    await this.db.execute(
      `INSERT INTO NetworkTopologyChange (id, companyId, changeType, sourceType, sourceId, title, details, status, detectedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      [randomUUID(), companyId, changeType, sourceType, sourceId, title, JSON.stringify(details || {}), new Date()],
    );
    return 1;
  }

  private mapNode(node: any, index: number) {
    const role = this.nodeRole(node);
    const col = index % 5;
    const row = Math.floor(index / 5);
    return {
      ...node,
      role,
      x: Number.isFinite(Number(node.x)) ? Number(node.x) : 120 + col * 220,
      y: Number.isFinite(Number(node.y)) ? Number(node.y) : 90 + row * 160,
      healthStatus: node.healthStatus || (node.status === 'active' ? 'ONLINE' : 'UNKNOWN'),
      impactScore: Number(node.activeAlerts || 0) * 5 + Number(node.openTickets || 0) * 2 + Number(node.downPorts || 0) + Number(node.errorPorts || 0),
    };
  }

  private nodeRole(node: any) {
    const text = [node.name, node.manufacturer, node.model, node.deviceCategory].join(' ').toLowerCase();
    if (text.includes('firewall') || text.includes('sonicwall') || text.includes('fortinet')) return 'firewall';
    if (text.includes('router') || text.includes('gateway') || text.includes('wan')) return 'router';
    if (text.includes('switch')) return 'switch';
    if (text.includes('ap') || text.includes('wireless') || text.includes('wifi')) return 'ap';
    if (text.includes('controller') || text.includes('meraki') || text.includes('unifi') || text.includes('omada')) return 'controller';
    return 'device';
  }

  private scopeFor(user: CurrentUser): Scope {
    if (user.companyId) return { companyId: user.companyId };
    if (user.role === 'SUPER_ADMIN') return { companyId: user.effectiveCompanyId || null };
    throw new ForbiddenException('Select a company context to view topology');
  }

  private resolveWriteCompany(user: CurrentUser, requestedCompanyId?: string): string {
    if (user.companyId) return user.companyId;
    if (user.role === 'SUPER_ADMIN') {
      const companyId = user.effectiveCompanyId || requestedCompanyId;
      if (companyId) return companyId;
    }
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
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS NetworkTopologyLayout (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        assetId VARCHAR(191) NOT NULL,
        x INT NOT NULL DEFAULT 0,
        y INT NOT NULL DEFAULT 0,
        locked TINYINT(1) DEFAULT 1,
        updatedById VARCHAR(191),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY NetworkTopologyLayout_company_asset_key (companyId, assetId),
        INDEX(companyId),
        INDEX(assetId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS NetworkTopologySetting (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL UNIQUE,
        customerVisible TINYINT(1) DEFAULT 0,
        shareEnabled TINYINT(1) DEFAULT 1,
        defaultOverlay VARCHAR(32) DEFAULT 'health',
        updatedById VARCHAR(191),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS NetworkTopologyShare (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        token VARCHAR(128) NOT NULL UNIQUE,
        name VARCHAR(191) NOT NULL,
        siteId VARCHAR(191),
        expiresAt DATETIME(3),
        active TINYINT(1) DEFAULT 1,
        createdById VARCHAR(191),
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId, active),
        INDEX(siteId),
        INDEX(expiresAt)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS NetworkTopologyChange (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        changeType VARCHAR(64) NOT NULL,
        sourceType VARCHAR(64),
        sourceId VARCHAR(191),
        title VARCHAR(191) NOT NULL,
        details TEXT,
        status VARCHAR(32) DEFAULT 'OPEN',
        detectedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        resolvedAt DATETIME(3),
        INDEX(companyId, status),
        INDEX(changeType),
        INDEX(sourceId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.ensureColumn('NetworkInterfaceMetric', 'neighborProtocol', 'VARCHAR(32)');
    await this.ensureColumn('NetworkInterfaceMetric', 'neighborSystemName', 'VARCHAR(191)');
    await this.ensureColumn('NetworkInterfaceMetric', 'neighborPort', 'VARCHAR(191)');
    await this.ensureColumn('NetworkInterfaceMetric', 'neighborAssetId', 'VARCHAR(191)');
  }

  private async ensureColumn(table: string, column: string, definition: string) {
    const rows = await this.db.query<any[]>(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
      [table, column],
    ).catch(() => []);
    if (!rows[0]) await this.db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
