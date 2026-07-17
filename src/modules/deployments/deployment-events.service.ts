import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { MigrationsService } from '../../database/migrations/migrations.service';
import { EmailService } from '../notifications/services/email.service';
import { RecordDeploymentEventDto } from './dto/record-deployment-event.dto';

const ALERT_STATUSES = new Set(['FAILED', 'ROLLED_BACK', 'UNHEALTHY']);

@Injectable()
export class DeploymentEventsService {
  private readonly logger = new Logger(DeploymentEventsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly migrations: MigrationsService,
    private readonly email: EmailService,
  ) {}

  async record(dto: RecordDeploymentEventDto) {
    const id = randomUUID();
    const source = dto.source || 'github-actions';
    const detail = JSON.stringify(dto.detail || {});
    await this.db.execute(
      `INSERT INTO DeploymentEvent (
         id, releaseCommit, component, status, source, workflowRunId, workflowUrl,
         durationMs, detail, startedAt, completedAt, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         status = VALUES(status), source = VALUES(source), workflowUrl = VALUES(workflowUrl),
         durationMs = VALUES(durationMs), detail = VALUES(detail),
         startedAt = COALESCE(VALUES(startedAt), startedAt),
         completedAt = VALUES(completedAt), updatedAt = NOW(3)`,
      [
        id, dto.releaseCommit.trim(), dto.component, dto.status, source,
        dto.workflowRunId || null, dto.workflowUrl || null, dto.durationMs ?? null,
        detail, dto.startedAt ? new Date(dto.startedAt) : null,
        dto.completedAt ? new Date(dto.completedAt) : null,
      ],
    );

    const rows = await this.db.query<any[]>(
      `SELECT * FROM DeploymentEvent
       WHERE releaseCommit = ? AND component = ? AND workflowRunId <=> ? LIMIT 1`,
      [dto.releaseCommit.trim(), dto.component, dto.workflowRunId || null],
    );
    if (ALERT_STATUSES.has(dto.status)) await this.alertAdministrators(rows[0]);
    return this.publicEvent(rows[0]);
  }

  async list(limitValue?: string | number) {
    const limit = Math.min(Math.max(Number(limitValue) || 50, 1), 100);
    const rows = await this.db.query<any[]>(
      `SELECT id, releaseCommit, component, status, source, workflowRunId, workflowUrl,
              durationMs, detail, startedAt, completedAt, createdAt, updatedAt
       FROM DeploymentEvent ORDER BY createdAt DESC LIMIT ?`,
      [limit],
    );
    return rows.map((row) => this.publicEvent(row));
  }

  migrationStatus() {
    return this.migrations.getStatus();
  }

  private publicEvent(row: any) {
    if (!row) return null;
    let detail: Record<string, unknown> = {};
    try { detail = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail || {}; } catch {}
    return { ...row, durationMs: row.durationMs == null ? null : Number(row.durationMs), detail };
  }

  private async alertAdministrators(event: any) {
    if (!event) return;
    const admins = await this.db.query<any[]>(
      `SELECT id, email, companyId, firstName FROM User
       WHERE role = 'SUPER_ADMIN' AND isActive = 1 AND deletedAt IS NULL`,
    );
    const shortCommit = String(event.releaseCommit || 'unknown').slice(0, 12);
    const title = `${event.component} deployment ${String(event.status).toLowerCase()}`;
    const body = `Release ${shortCommit} reported ${event.status}. Review deployment history for details.`;
    for (const admin of admins) {
      await this.db.execute(
        `INSERT INTO Notification (id, userId, companyId, title, body, type, isRead, link, createdAt)
         VALUES (?, ?, ?, ?, ?, 'error', 0, '/admin/system#deployment-history', NOW(3))`,
        [randomUUID(), admin.id, admin.companyId || null, title, body],
      ).catch((error) => this.logger.warn(`Unable to create deployment notification: ${String(error?.message || error)}`));
      if (admin.email) {
        await this.email.sendNotificationEmail(
          admin.email,
          `[FieldserviceIT] ${title}`,
          `<h2>${this.escapeHtml(title)}</h2><p>${this.escapeHtml(body)}</p>${event.workflowUrl ? `<p><a href="${this.escapeHtml(event.workflowUrl)}">Open workflow run</a></p>` : ''}`,
          { text: `${title}\n\n${body}${event.workflowUrl ? `\n${event.workflowUrl}` : ''}` },
        ).catch((error) => this.logger.warn(`Unable to email deployment alert: ${String(error?.message || error)}`));
      }
    }
  }

  private escapeHtml(value: string) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] || char);
  }
}
