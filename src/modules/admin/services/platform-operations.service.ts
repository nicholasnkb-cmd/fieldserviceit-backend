import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { CurrentUser } from '../../../common/types';
import { MigrationsService } from '../../../database/migrations/migrations.service';
import { PrismaService } from '../../../database/prisma.service';
import { AdminService } from './admin.service';

@Injectable()
export class PlatformOperationsService {
  constructor(private prisma: PrismaService, private migrations: MigrationsService, private admin: AdminService) {}

  async getSystemReadiness() {
    const readiness: any = await this.admin.getSystemReadiness();
    const offsite = Boolean(process.env.BACKUP_S3_ENDPOINT && process.env.BACKUP_S3_BUCKET && process.env.BACKUP_S3_ACCESS_KEY_ID && process.env.BACKUP_S3_SECRET_ACCESS_KEY);
    readiness.checks.push({ name: 'Off-site backup storage', status: offsite ? 'ok' : 'critical', detail: offsite ? 'S3-compatible encrypted backup storage is configured.' : 'Configure BACKUP_S3_ENDPOINT, bucket, access key, and secret key.' });
    const destinations = await this.prisma.query<any[]>(`SELECT COUNT(*) count FROM SecurityEventDestination WHERE isActive = 1`).catch(() => []);
    const alerts = Boolean(process.env.OPERATIONS_ALERT_WEBHOOK_URL) || Number(destinations[0]?.count || 0) > 0;
    readiness.checks.push({ name: 'Operations alerts', status: alerts ? 'ok' : 'warning', detail: alerts ? 'At least one Slack, Teams, webhook, or security-event destination is active.' : 'Add a Slack or Teams destination so failures reach the operations team.' });
    const critical = readiness.checks.filter((check: any) => check.status === 'critical').length;
    const warning = readiness.checks.filter((check: any) => check.status === 'warning').length;
    readiness.status = critical ? 'blocked' : warning ? 'needs_attention' : 'ready';
    readiness.score = Math.max(0, Math.round(((readiness.checks.length - critical - warning * 0.4) / Math.max(readiness.checks.length, 1)) * 100));
    const hrefs: Record<string, string> = { 'Off-site backup storage': '/admin/security-operations', 'Operations alerts': '/admin/permissions', 'Monitoring worker': '/network', 'RMM sync worker': '/integrations/rmm' };
    readiness.actions = readiness.checks.filter((check: any) => check.status !== 'ok').map((check: any) => ({ name: check.name, severity: check.status, detail: check.detail, href: hrefs[check.name] || '/admin/system' }));
    return readiness;
  }

  async overview() {
    const [readiness, deployments, backups, jobs, email, securityAlerts, notices, migrations] = await Promise.all([
      this.getSystemReadiness(),
      this.prisma.query<any[]>(`SELECT id, releaseCommit, component, status, workflowUrl, durationMs, completedAt, createdAt FROM DeploymentEvent ORDER BY createdAt DESC LIMIT 10`).catch(() => []),
      this.prisma.query<any[]>(`SELECT id, status, destination, bytes, restoreTestStatus, completedAt, errorMessage FROM BackupRun ORDER BY startedAt DESC LIMIT 10`).catch(() => []),
      this.prisma.query<any[]>(`SELECT id, jobName, status, detail, startedAt, completedAt FROM OperationalJobRun ORDER BY startedAt DESC LIMIT 10`).catch(() => []),
      this.prisma.query<any[]>(`SELECT isActive, lastTestStatus, lastTestAt, lastTestError FROM EmailProviderConfig WHERE id = 'global-smtp' LIMIT 1`).catch(() => []),
      this.prisma.query<any[]>(`SELECT id, alertType, severity, summary, acknowledgedAt, createdAt FROM SecurityAlert ORDER BY createdAt DESC LIMIT 10`).catch(() => []),
      this.prisma.query<any[]>(`SELECT * FROM StatusNotice ORDER BY updatedAt DESC LIMIT 20`).catch(() => []),
      this.migrations.getStatus(),
    ]);
    return { generatedAt: new Date().toISOString(), readiness, deployments, backups, jobs, email: email[0] || null, securityAlerts, notices, migrations };
  }

  async createNotice(dto: any, actor: CurrentUser) {
    const title = String(dto.title || '').trim().slice(0, 191), message = String(dto.message || '').trim().slice(0, 4000);
    if (!title || !message) throw new BadRequestException('Notice title and message are required');
    const id = crypto.randomUUID(), status = String(dto.status || 'SCHEDULED').toUpperCase();
    await this.prisma.execute(`INSERT INTO StatusNotice (id, title, message, noticeType, status, startsAt, endsAt, publishedAt, resolvedAt, createdById, updatedById, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`, [id, title, message, String(dto.noticeType || 'MAINTENANCE').toUpperCase(), status, dto.startsAt ? new Date(dto.startsAt) : null, dto.endsAt ? new Date(dto.endsAt) : null, dto.published === false ? null : new Date(), status === 'RESOLVED' ? new Date() : null, actor.id, actor.id]);
    return (await this.prisma.query<any[]>(`SELECT * FROM StatusNotice WHERE id = ? LIMIT 1`, [id]))[0];
  }

  async updateNotice(id: string, dto: any, actor: CurrentUser) {
    const item = (await this.prisma.query<any[]>(`SELECT * FROM StatusNotice WHERE id = ? LIMIT 1`, [id]))[0];
    if (!item) throw new NotFoundException('Status notice not found');
    const status = String(dto.status || item.status).toUpperCase();
    await this.prisma.execute(`UPDATE StatusNotice SET title = ?, message = ?, noticeType = ?, status = ?, startsAt = ?, endsAt = ?, publishedAt = ?, resolvedAt = ?, updatedById = ?, updatedAt = NOW(3) WHERE id = ?`, [String(dto.title ?? item.title).trim().slice(0, 191), String(dto.message ?? item.message).trim().slice(0, 4000), String(dto.noticeType || item.noticeType).toUpperCase(), status, dto.startsAt === undefined ? item.startsAt : dto.startsAt ? new Date(dto.startsAt) : null, dto.endsAt === undefined ? item.endsAt : dto.endsAt ? new Date(dto.endsAt) : null, dto.published === undefined ? item.publishedAt : dto.published ? (item.publishedAt || new Date()) : null, status === 'RESOLVED' ? (item.resolvedAt || new Date()) : null, actor.id, id]);
    return (await this.prisma.query<any[]>(`SELECT * FROM StatusNotice WHERE id = ? LIMIT 1`, [id]))[0];
  }

  async deleteNotice(id: string) {
    const result = await this.prisma.execute(`DELETE FROM StatusNotice WHERE id = ?`, [id]);
    if (!result.affectedRows) throw new NotFoundException('Status notice not found');
    return { id, deleted: true };
  }

  async bulkUserStatus(ids: string[], isActive: boolean, actor: CurrentUser) {
    const unique = [...new Set((ids || []).map(String))].slice(0, 100);
    if (!unique.length) throw new BadRequestException('Select at least one user');
    for (const id of unique) await this.admin.updateUser(id, { isActive: Boolean(isActive) }, actor);
    return { updated: unique.length, isActive: Boolean(isActive) };
  }

  async cleanupAbandonedTenants(dryRun = false) {
    const candidates = await this.prisma.query<any[]>(`SELECT c.id, c.name, c.createdAt, COUNT(u.id) userCount FROM Company c LEFT JOIN User u ON u.companyId = c.id AND u.deletedAt IS NULL WHERE c.deletedAt IS NULL AND c.createdAt < DATE_SUB(NOW(3), INTERVAL 30 DAY) AND NOT EXISTS (SELECT 1 FROM Ticket t WHERE t.companyId = c.id AND t.deletedAt IS NULL) AND NOT EXISTS (SELECT 1 FROM Asset a WHERE a.companyId = c.id AND a.deletedAt IS NULL) AND NOT EXISTS (SELECT 1 FROM User activeUser WHERE activeUser.companyId = c.id AND activeUser.deletedAt IS NULL AND (activeUser.lastLoginAt IS NOT NULL OR activeUser.emailVerified = 1)) GROUP BY c.id, c.name, c.createdAt LIMIT 100`).catch(() => []);
    if (!dryRun && candidates.length) {
      const ids = candidates.map((item) => item.id), placeholders = ids.map(() => '?').join(',');
      await this.prisma.execute(`UPDATE User SET isActive = 0, deletedAt = COALESCE(deletedAt, NOW(3)), authVersion = authVersion + 1, updatedAt = NOW(3) WHERE companyId IN (${placeholders})`, ids);
      await this.prisma.execute(`UPDATE Company SET isActive = 0, deletedAt = NOW(3), updatedAt = NOW(3) WHERE id IN (${placeholders})`, ids);
    }
    return { dryRun, count: candidates.length, candidates };
  }

  @Cron('30 4 * * 0')
  scheduledCleanup() { return this.cleanupAbandonedTenants(false); }
}
