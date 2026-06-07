import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { LoggerService } from '../../../common/logger/logger.service';
import { CurrentUser } from '../../../common/types';
import { PrismaService } from '../../../database/prisma.service';
import { EmailService } from './email.service';

const DEFAULT_EVENTS: Record<string, boolean> = {
  ticket_created: true,
  ticket_status: true,
  ticket_resolution: true,
  ticket_comments: true,
  ticket_assignment: true,
  ticket_attachments: true,
  ticket_time: true,
  dispatch: true,
  automated: true,
  sla: true,
};

const CRITICAL_CATEGORIES = new Set(['ticket_status', 'ticket_resolution', 'sla', 'security']);
const DELIVERY_STATUSES = new Set(['QUEUED', 'DIGEST_PENDING', 'SENDING', 'SENT', 'FAILED', 'BOUNCED', 'SUPPRESSED']);

type DeliveryInput = {
  companyId?: string | null;
  ticketId?: string | null;
  userId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  eventType: string;
  eventCategory: string;
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  priority?: number;
  senderName?: string | null;
  replyTo?: string | null;
  metadata?: Record<string, unknown>;
};

type TicketEmailInput = {
  companyId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  ticketNumber: string;
  ticketTitle: string;
  action: string;
  detail?: string;
  actorName?: string | null;
  ticketUrl: string;
  eventType: string;
};

type PreferenceRow = {
  id: string;
  userId: string;
  emailEnabled: number | boolean;
  pushEnabled: number | boolean;
  smsEnabled: number | boolean;
  digestDaily: number | boolean;
  settings?: string | null;
  unsubscribeToken?: string | null;
  digestHour?: number | null;
  timezone?: string | null;
};

@Injectable()
export class EmailDeliveryService {
  private processingQueue = false;
  private processingDigests = false;
  private processingEscalations = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly logger: LoggerService,
  ) {}

  async enqueue(input: DeliveryInput) {
    const recipientEmail = this.normalizeEmail(input.recipientEmail);
    if (!recipientEmail) throw new BadRequestException('A valid recipient email is required');

    const critical = CRITICAL_CATEGORIES.has(input.eventCategory);
    const suppression = await this.prisma.query<any[]>(
      `SELECT reason FROM EmailSuppression WHERE recipientEmail = ? LIMIT 1`,
      [recipientEmail],
    );
    const suppressionReason = suppression[0]?.reason;
    const blocked = suppressionReason && (critical ? suppressionReason !== 'UNSUBSCRIBED' : true);

    let preferences: PreferenceRow | null = null;
    if (input.userId) preferences = await this.ensurePreferences(input.userId);
    const settings = this.parseSettings(preferences?.settings);
    const eventEnabled = settings.events[input.eventCategory] !== false;
    const optionalDisabled = !critical && (
      preferences && !this.asBoolean(preferences.emailEnabled)
      || !eventEnabled
    );
    const digest = !critical && !!preferences && this.asBoolean(preferences.digestDaily);
    const status = blocked || optionalDisabled
      ? 'SUPPRESSED'
      : digest
        ? 'DIGEST_PENDING'
        : 'QUEUED';
    const metadata = {
      ...(input.metadata || {}),
      senderName: input.senderName || undefined,
      replyTo: input.replyTo || undefined,
      suppressionReason: blocked ? suppressionReason : optionalDisabled ? 'PREFERENCE' : undefined,
    };
    const id = randomUUID();

    await this.prisma.execute(
      `INSERT INTO EmailDelivery (
        id, companyId, ticketId, userId, recipientEmail, recipientName, eventType, eventCategory,
        subject, htmlBody, textBody, status, priority, attempts, maxAttempts, nextAttemptAt,
        metadata, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 5, NOW(3), ?, NOW(3), NOW(3))`,
      [
        id,
        input.companyId || null,
        input.ticketId || null,
        input.userId || null,
        recipientEmail,
        input.recipientName?.trim() || null,
        input.eventType,
        input.eventCategory,
        input.subject.slice(0, 255),
        input.htmlBody,
        input.textBody || null,
        status,
        Number(input.priority || (critical ? 90 : 50)),
        JSON.stringify(metadata),
      ],
    );
    return { id, status };
  }

  async prepareTicketEmail(input: TicketEmailInput) {
    const companyRows = input.companyId
      ? await this.prisma.query<any[]>(
          `SELECT name, branding FROM Company WHERE id = ? AND deletedAt IS NULL LIMIT 1`,
          [input.companyId],
        )
      : [];
    const templateRows = input.companyId
      ? await this.prisma.query<any[]>(
          `SELECT * FROM EmailTemplate WHERE companyId = ? AND eventType = ? AND enabled = 1 LIMIT 1`,
          [input.companyId, input.eventType],
        )
      : [];
    const company = companyRows[0] || {};
    const template = templateRows[0] || {};
    const branding = this.safeJson<Record<string, any>>(company.branding, {});
    const accentColor = this.safeColor(template.accentColor || branding.primaryColor || '#2563eb');
    const companyName = template.headerText || branding.companyName || company.name || 'FieldserviceIT';
    const footerText = template.footerText || 'This is an automated ticket notification.';
    const greeting = input.recipientName?.trim() ? `Hello ${input.recipientName.trim()},` : 'Hello,';
    const unsubscribeUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/unsubscribe?token=${encodeURIComponent(this.unsubscribeToken(input.recipientEmail))}`;
    const values: Record<string, string> = {
      companyName,
      ticketNumber: input.ticketNumber,
      ticketTitle: input.ticketTitle,
      action: input.action,
      detail: input.detail?.trim() || '',
      actorName: input.actorName || '',
      ticketUrl: input.ticketUrl,
      greeting,
      unsubscribeUrl,
    };
    const subject = template.subjectTemplate
      ? this.replaceSubjectTemplate(template.subjectTemplate, values)
      : `Ticket ${input.ticketNumber}: ${input.action}`;
    const content = `
      <p>${this.escapeHtml(greeting)}</p>
      <p>An update was made to a ticket you opened or are listed as the affected contact.</p>
      <p>
        <strong>Ticket:</strong> ${this.escapeHtml(input.ticketNumber)}<br>
        <strong>Title:</strong> ${this.escapeHtml(input.ticketTitle)}<br>
        <strong>Action:</strong> ${this.escapeHtml(input.action)}
      </p>
      ${input.detail?.trim() ? `<p><strong>Details:</strong><br>${this.escapeHtml(input.detail.trim()).replace(/\n/g, '<br>')}</p>` : ''}
      ${input.actorName ? `<p><strong>Updated by:</strong> ${this.escapeHtml(input.actorName)}</p>` : ''}
      <p><a href="${this.escapeHtml(input.ticketUrl)}" style="color:${accentColor};font-weight:600">View ticket</a></p>
    `;
    const customContent = template.htmlTemplate
      ? this.sanitizeTemplateHtml(this.replaceTemplate(template.htmlTemplate, { ...values, content }, true))
      : content;
    const htmlBody = `<!doctype html>
      <html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#172033">
        <div style="max-width:640px;margin:0 auto;padding:24px 12px">
          <div style="border-top:4px solid ${accentColor};background:#ffffff;padding:24px;border-radius:6px">
            <h2 style="margin:0 0 20px;font-size:20px">${this.escapeHtml(companyName)}</h2>
            ${customContent}
            <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0 16px">
            <p style="font-size:12px;color:#6b7280">${this.escapeHtml(footerText)}</p>
            <p style="font-size:12px;color:#6b7280"><a href="${this.escapeHtml(unsubscribeUrl)}" style="color:#6b7280">Manage email preferences or unsubscribe</a></p>
          </div>
        </div>
      </body></html>`;
    const textBody = [
      greeting,
      '',
      `Ticket: ${input.ticketNumber}`,
      `Title: ${input.ticketTitle}`,
      `Action: ${input.action}`,
      input.detail?.trim() ? `Details: ${input.detail.trim()}` : '',
      input.actorName ? `Updated by: ${input.actorName}` : '',
      '',
      `View ticket: ${input.ticketUrl}`,
      `Manage email preferences: ${unsubscribeUrl}`,
    ].filter(Boolean).join('\n');

    return {
      subject,
      htmlBody,
      textBody,
      senderName: template.senderName || companyName,
      replyTo: template.replyTo || process.env.SMTP_REPLY_TO || null,
    };
  }

  async getPreferences(userId: string) {
    const row = await this.ensurePreferences(userId);
    return this.preferenceResponse(row);
  }

  async updatePreferences(userId: string, input: any) {
    const current = await this.ensurePreferences(userId);
    const settings = this.parseSettings(current.settings);
    const events = { ...settings.events };
    if (input.events && typeof input.events === 'object') {
      for (const key of Object.keys(DEFAULT_EVENTS)) {
        if (typeof input.events[key] === 'boolean') events[key] = input.events[key];
      }
    }
    events.ticket_status = true;
    events.ticket_resolution = true;
    events.sla = true;
    const digestHour = Math.max(0, Math.min(23, Number(input.digestHour ?? current.digestHour ?? 8)));
    const timezone = this.validTimezone(input.timezone || current.timezone || 'UTC');
    await this.prisma.execute(
      `UPDATE NotificationPreference
       SET emailEnabled = ?, pushEnabled = ?, smsEnabled = ?, digestDaily = ?,
           settings = ?, digestHour = ?, timezone = ?
       WHERE userId = ?`,
      [
        input.emailEnabled === undefined ? this.asBoolean(current.emailEnabled) : !!input.emailEnabled,
        input.pushEnabled === undefined ? this.asBoolean(current.pushEnabled) : !!input.pushEnabled,
        input.smsEnabled === undefined ? this.asBoolean(current.smsEnabled) : !!input.smsEnabled,
        input.digestDaily === undefined ? this.asBoolean(current.digestDaily) : !!input.digestDaily,
        JSON.stringify({ events }),
        digestHour,
        timezone,
        userId,
      ],
    );
    return this.getPreferences(userId);
  }

  async unsubscribe(token: string) {
    const email = this.verifyUnsubscribeToken(token);
    if (!email) throw new BadRequestException('This unsubscribe link is invalid or expired');
    await this.prisma.execute(
      `INSERT INTO EmailSuppression (id, recipientEmail, reason, source, details, createdAt, updatedAt)
       VALUES (?, ?, 'UNSUBSCRIBED', 'RECIPIENT', 'Unsubscribed using email preference link', NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE reason = 'UNSUBSCRIBED', source = 'RECIPIENT', details = VALUES(details), updatedAt = NOW(3)`,
      [randomUUID(), email],
    );
    const users = await this.prisma.query<any[]>(`SELECT id FROM User WHERE LOWER(email) = ? LIMIT 1`, [email]);
    if (users[0]?.id) {
      await this.ensurePreferences(users[0].id);
      await this.prisma.execute(`UPDATE NotificationPreference SET emailEnabled = 0 WHERE userId = ?`, [users[0].id]);
    }
    return { success: true, email: this.maskEmail(email), criticalUpdatesContinue: true };
  }

  async resubscribe(userId: string, email: string) {
    await this.ensurePreferences(userId);
    await this.prisma.execute(`UPDATE NotificationPreference SET emailEnabled = 1 WHERE userId = ?`, [userId]);
    await this.prisma.execute(
      `DELETE FROM EmailSuppression WHERE recipientEmail = ? AND reason = 'UNSUBSCRIBED'`,
      [this.normalizeEmail(email)],
    );
    return this.getPreferences(userId);
  }

  async listDeliveries(user: CurrentUser, query: any) {
    this.assertOperationsRole(user);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const clauses: string[] = [];
    const values: any[] = [];
    const companyId = this.companyScope(user);
    if (companyId) {
      clauses.push('companyId = ?');
      values.push(companyId);
    }
    if (query.status && DELIVERY_STATUSES.has(String(query.status).toUpperCase())) {
      clauses.push('status = ?');
      values.push(String(query.status).toUpperCase());
    }
    if (query.ticketId) {
      clauses.push('ticketId = ?');
      values.push(query.ticketId);
    }
    if (query.search) {
      clauses.push('(recipientEmail LIKE ? OR subject LIKE ? OR eventType LIKE ?)');
      const search = `%${String(query.search).trim()}%`;
      values.push(search, search, search);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const totals = await this.prisma.query<any[]>(`SELECT COUNT(*) total FROM EmailDelivery ${where}`, values);
    const rows = await this.prisma.query<any[]>(
      `SELECT id, companyId, ticketId, userId, recipientEmail, recipientName, eventType, eventCategory,
              subject, status, priority, attempts, maxAttempts, nextAttemptAt, providerMessageId,
              errorMessage, createdAt, updatedAt, sentAt, bouncedAt
       FROM EmailDelivery ${where}
       ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
      [...values, limit, (page - 1) * limit],
    );
    return {
      data: rows,
      meta: { page, limit, total: Number(totals[0]?.total || 0), totalPages: Math.ceil(Number(totals[0]?.total || 0) / limit) },
    };
  }

  async summary(user: CurrentUser) {
    this.assertOperationsRole(user);
    const companyId = this.companyScope(user);
    const where = companyId ? 'WHERE companyId = ?' : '';
    const values = companyId ? [companyId] : [];
    const counts = await this.prisma.query<any[]>(
      `SELECT status, COUNT(*) count FROM EmailDelivery ${where} GROUP BY status`,
      values,
    );
    const last24Where = companyId ? 'WHERE companyId = ? AND createdAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)' : 'WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
    const recent = await this.prisma.query<any[]>(
      `SELECT COUNT(*) total,
              SUM(status = 'SENT') sent,
              SUM(status IN ('FAILED', 'BOUNCED')) failed,
              MIN(CASE WHEN status IN ('QUEUED', 'FAILED') THEN createdAt END) oldestQueuedAt
       FROM EmailDelivery ${last24Where}`,
      values,
    );
    return {
      smtp: await this.emailService.getStatus(),
      webhooks: {
        inboundEmailConfigured: !!process.env.INBOUND_EMAIL_API_KEY,
        bounceWebhookConfigured: !!process.env.EMAIL_WEBHOOK_API_KEY,
      },
      counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.count)])),
      last24Hours: {
        total: Number(recent[0]?.total || 0),
        sent: Number(recent[0]?.sent || 0),
        failed: Number(recent[0]?.failed || 0),
        oldestQueuedAt: recent[0]?.oldestQueuedAt || null,
      },
    };
  }

  async retry(id: string, user: CurrentUser) {
    this.assertOperationsRole(user);
    const companyId = this.companyScope(user);
    const rows = await this.prisma.query<any[]>(
      `SELECT id, companyId, status FROM EmailDelivery WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!rows[0] || (companyId && rows[0].companyId !== companyId)) throw new NotFoundException('Email delivery not found');
    if (rows[0].status !== 'FAILED') {
      throw new BadRequestException('Only failed deliveries can be retried');
    }
    await this.prisma.execute(
      `UPDATE EmailDelivery SET status = 'QUEUED', attempts = 0, nextAttemptAt = NOW(3),
       errorMessage = NULL, bouncedAt = NULL, updatedAt = NOW(3) WHERE id = ?`,
      [id],
    );
    return { success: true };
  }

  async ticketHistory(ticketId: string) {
    return this.prisma.query<any[]>(
      `SELECT id, recipientEmail, recipientName, eventType, eventCategory, subject, status,
              attempts, maxAttempts, errorMessage, createdAt, sentAt, bouncedAt
       FROM EmailDelivery WHERE ticketId = ? ORDER BY createdAt DESC LIMIT 100`,
      [ticketId],
    );
  }

  async getTemplate(user: CurrentUser, eventType: string) {
    this.assertTemplateRole(user);
    const companyId = this.requiredCompanyScope(user);
    const rows = await this.prisma.query<any[]>(
      `SELECT * FROM EmailTemplate WHERE companyId = ? AND eventType = ? LIMIT 1`,
      [companyId, this.cleanEventType(eventType)],
    );
    return rows[0] || {
      companyId,
      eventType: this.cleanEventType(eventType),
      subjectTemplate: 'Ticket {{ticketNumber}}: {{action}}',
      htmlTemplate: '',
      senderName: '',
      replyTo: '',
      accentColor: '#2563eb',
      headerText: '',
      footerText: 'This is an automated ticket notification.',
      enabled: true,
    };
  }

  async upsertTemplate(user: CurrentUser, eventType: string, input: any) {
    this.assertTemplateRole(user);
    const companyId = this.requiredCompanyScope(user);
    const type = this.cleanEventType(eventType);
    const accentColor = this.safeColor(input.accentColor || '#2563eb');
    const id = randomUUID();
    await this.prisma.execute(
      `INSERT INTO EmailTemplate (
        id, companyId, eventType, subjectTemplate, htmlTemplate, senderName, replyTo,
        accentColor, headerText, footerText, enabled, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE subjectTemplate = VALUES(subjectTemplate), htmlTemplate = VALUES(htmlTemplate),
        senderName = VALUES(senderName), replyTo = VALUES(replyTo), accentColor = VALUES(accentColor),
        headerText = VALUES(headerText), footerText = VALUES(footerText), enabled = VALUES(enabled), updatedAt = NOW(3)`,
      [
        id,
        companyId,
        type,
        String(input.subjectTemplate || '').slice(0, 255) || null,
        String(input.htmlTemplate || '') || null,
        String(input.senderName || '').slice(0, 191) || null,
        this.normalizeEmail(input.replyTo || '') || null,
        accentColor,
        String(input.headerText || '').slice(0, 255) || null,
        String(input.footerText || '').slice(0, 500) || null,
        input.enabled === false ? 0 : 1,
      ],
    );
    return this.getTemplate(user, type);
  }

  async recordBounce(input: { messageId?: string; email?: string; reason?: string; details?: string }) {
    const email = this.normalizeEmail(input.email || '');
    if (!input.messageId && !email) throw new BadRequestException('messageId or email is required');
    if (input.messageId) {
      await this.prisma.execute(
        `UPDATE EmailDelivery SET status = 'BOUNCED', bouncedAt = NOW(3), updatedAt = NOW(3),
         errorMessage = ? WHERE providerMessageId = ?`,
        [input.details || input.reason || 'Message bounced', input.messageId],
      );
    }
    const rows = email
      ? [{ recipientEmail: email }]
      : await this.prisma.query<any[]>(
          `SELECT recipientEmail FROM EmailDelivery WHERE providerMessageId = ? LIMIT 1`,
          [input.messageId],
        );
    const recipientEmail = rows[0]?.recipientEmail;
    if (recipientEmail) {
      await this.prisma.execute(
        `INSERT INTO EmailSuppression (id, recipientEmail, reason, source, details, createdAt, updatedAt)
         VALUES (?, ?, 'BOUNCE', 'SMTP_WEBHOOK', ?, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE reason = 'BOUNCE', source = 'SMTP_WEBHOOK', details = VALUES(details), updatedAt = NOW(3)`,
        [randomUUID(), recipientEmail, input.details || input.reason || 'Message bounced'],
      );
    }
    return { success: true };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;
    try {
      const rows = await this.prisma.query<any[]>(
        `SELECT * FROM EmailDelivery
         WHERE status IN ('QUEUED', 'FAILED') AND attempts < maxAttempts
           AND (nextAttemptAt IS NULL OR nextAttemptAt <= NOW(3))
         ORDER BY priority DESC, createdAt ASC LIMIT 25`,
      );
      await Promise.all(rows.map((row) => this.deliver(row)));
    } catch (error: any) {
      this.logger.error(`[EmailDeliveryService] Queue worker failed: ${error?.message || error}`);
    } finally {
      this.processingQueue = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processDigests() {
    if (this.processingDigests) return;
    this.processingDigests = true;
    try {
      const rows = await this.prisma.query<any[]>(
        `SELECT d.*, p.digestHour, p.timezone
         FROM EmailDelivery d
         LEFT JOIN NotificationPreference p ON p.userId = d.userId
         WHERE d.status = 'DIGEST_PENDING' AND d.attempts < d.maxAttempts
           AND d.createdAt <= DATE_SUB(NOW(3), INTERVAL 15 MINUTE)
         ORDER BY d.recipientEmail, d.createdAt ASC LIMIT 500`,
      );
      const groups = new Map<string, any[]>();
      for (const row of rows) {
        const timezone = this.validTimezone(row.timezone || 'UTC');
        const currentHour = Number(new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          hour12: false,
          hourCycle: 'h23',
        }).format(new Date()));
        if (currentHour !== Number(row.digestHour ?? 8)) continue;
        const key = `${row.userId || row.recipientEmail}:${row.recipientEmail}`;
        groups.set(key, [...(groups.get(key) || []), row]);
      }
      for (const group of groups.values()) await this.deliverDigest(group);
    } catch (error: any) {
      this.logger.error(`[EmailDeliveryService] Digest worker failed: ${error?.message || error}`);
    } finally {
      this.processingDigests = false;
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async processSlaEscalations() {
    if (this.processingEscalations) return;
    this.processingEscalations = true;
    try {
      const tickets = await this.prisma.query<any[]>(
        `SELECT t.id, t.ticketNumber, t.title, t.companyId, t.createdAt, t.status,
                s.resolutionTimeMin, s.escalateAfterMin,
                assigned.id assignedUserId, assigned.email assignedEmail, assigned.firstName assignedFirstName, assigned.lastName assignedLastName,
                escalation.id escalationUserId, escalation.email escalationEmail, escalation.firstName escalationFirstName, escalation.lastName escalationLastName
         FROM Ticket t
         INNER JOIN SLA s ON s.id = t.slaId AND s.isActive = 1
         LEFT JOIN User assigned ON assigned.id = t.assignedToId
         LEFT JOIN User escalation ON escalation.id = s.escalateToId
         WHERE t.deletedAt IS NULL AND t.resolvedAt IS NULL
           AND t.status NOT IN ('RESOLVED', 'CLOSED')
           AND TIMESTAMPDIFF(MINUTE, t.createdAt, NOW(3)) >= FLOOR(s.resolutionTimeMin * 0.75)
         LIMIT 250`,
      );
      for (const ticket of tickets) {
        const ageMinutes = Math.max(0, Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000));
        const levels: string[] = [];
        if (ageMinutes >= Number(ticket.resolutionTimeMin)) levels.push('BREACHED');
        else levels.push('AT_RISK');
        if (ticket.escalateAfterMin && ageMinutes >= Number(ticket.escalateAfterMin)) levels.push('MANAGER_ESCALATION');
        for (const level of levels) await this.queueSlaEscalation(ticket, level, ageMinutes);
      }
    } catch (error: any) {
      this.logger.error(`[EmailDeliveryService] SLA escalation worker failed: ${error?.message || error}`);
    } finally {
      this.processingEscalations = false;
    }
  }

  private async deliver(row: any) {
    const claim = await this.prisma.execute(
      `UPDATE EmailDelivery SET status = 'SENDING', attempts = attempts + 1, updatedAt = NOW(3)
       WHERE id = ? AND status IN ('QUEUED', 'FAILED')`,
      [row.id],
    );
    if (!claim.affectedRows) return;
    const metadata = this.safeJson<Record<string, any>>(row.metadata, {});
    try {
      const result = await this.emailService.sendNotificationEmail(
        row.recipientEmail,
        row.subject,
        row.htmlBody,
        {
          text: row.textBody || undefined,
          fromName: metadata.senderName || undefined,
          replyTo: metadata.replyTo || undefined,
        },
      );
      await this.prisma.execute(
        `UPDATE EmailDelivery SET status = 'SENT', providerMessageId = ?, sentAt = NOW(3),
         errorMessage = NULL, updatedAt = NOW(3) WHERE id = ?`,
        [result.messageId || null, row.id],
      );
    } catch (error: any) {
      const attempts = Number(row.attempts || 0) + 1;
      const delayMinutes = Math.min(240, Math.pow(2, Math.max(0, attempts - 1)) * 2);
      await this.prisma.execute(
        `UPDATE EmailDelivery SET status = 'FAILED', errorMessage = ?,
         nextAttemptAt = DATE_ADD(NOW(3), INTERVAL ? MINUTE), updatedAt = NOW(3) WHERE id = ?`,
        [String(error?.message || error).slice(0, 2000), delayMinutes, row.id],
      );
    }
  }

  private async deliverDigest(rows: any[]) {
    if (!rows.length) return;
    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const claim = await this.prisma.execute(
      `UPDATE EmailDelivery SET status = 'SENDING', attempts = attempts + 1, updatedAt = NOW(3)
       WHERE id IN (${placeholders}) AND status = 'DIGEST_PENDING'`,
      ids,
    );
    if (!claim.affectedRows) return;
    const items = rows.map((row) => `<li style="margin-bottom:10px"><strong>${this.escapeHtml(row.subject)}</strong><br><span style="color:#6b7280">${this.escapeHtml(row.eventType.replaceAll('_', ' '))}</span></li>`).join('');
    const html = `<h2>Ticket update digest</h2><p>You have ${rows.length} ticket updates.</p><ul>${items}</ul>`;
    const text = rows.map((row) => `- ${row.subject}`).join('\n');
    const metadata = this.safeJson<Record<string, any>>(rows[0].metadata, {});
    try {
      const result = await this.emailService.sendNotificationEmail(
        rows[0].recipientEmail,
        `${rows.length} ticket update${rows.length === 1 ? '' : 's'} from FieldserviceIT`,
        html,
        { text, fromName: metadata.senderName, replyTo: metadata.replyTo },
      );
      await this.prisma.execute(
        `UPDATE EmailDelivery SET status = 'SENT', providerMessageId = ?, sentAt = NOW(3),
         errorMessage = NULL, updatedAt = NOW(3) WHERE id IN (${placeholders})`,
        [result.messageId || null, ...ids],
      );
    } catch (error: any) {
      await this.prisma.execute(
        `UPDATE EmailDelivery
         SET status = CASE WHEN attempts >= maxAttempts THEN 'FAILED' ELSE 'DIGEST_PENDING' END,
         errorMessage = ?, updatedAt = NOW(3)
         WHERE id IN (${placeholders})`,
        [String(error?.message || error).slice(0, 2000), ...ids],
      );
    }
  }

  private async queueSlaEscalation(ticket: any, level: string, ageMinutes: number) {
    const adminRows = ticket.companyId
      ? await this.prisma.query<any[]>(
          `SELECT id userId, email, firstName, lastName
           FROM User WHERE companyId = ? AND role = 'TENANT_ADMIN' AND isActive = 1
             AND deletedAt IS NULL AND email IS NOT NULL`,
          [ticket.companyId],
        )
      : [];
    const recipients = [
      ticket.assignedEmail ? {
        userId: ticket.assignedUserId,
        email: ticket.assignedEmail,
        name: [ticket.assignedFirstName, ticket.assignedLastName].filter(Boolean).join(' '),
      } : null,
      level === 'MANAGER_ESCALATION' && ticket.escalationEmail ? {
        userId: ticket.escalationUserId,
        email: ticket.escalationEmail,
        name: [ticket.escalationFirstName, ticket.escalationLastName].filter(Boolean).join(' '),
      } : null,
      ...adminRows.map((admin) => ({
        userId: admin.userId,
        email: admin.email,
        name: [admin.firstName, admin.lastName].filter(Boolean).join(' '),
      })),
    ].filter(Boolean) as Array<{ userId: string; email: string; name: string }>;
    const unique = new Map(recipients.map((recipient) => [this.normalizeEmail(recipient.email), recipient]));
    if (!unique.size) return;
    const inserted = await this.prisma.execute(
      `INSERT IGNORE INTO TicketEmailEscalation (id, ticketId, escalationLevel, createdAt)
       VALUES (?, ?, ?, NOW(3))`,
      [randomUUID(), ticket.id, level],
    );
    if (!inserted.affectedRows) return;
    for (const recipient of unique.values()) {
      const action = level === 'BREACHED'
        ? 'SLA resolution target breached'
        : level === 'MANAGER_ESCALATION'
          ? 'SLA manager escalation required'
          : 'SLA resolution target at risk';
      const prepared = await this.prepareTicketEmail({
        companyId: ticket.companyId,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        ticketNumber: ticket.ticketNumber,
        ticketTitle: ticket.title,
        action,
        detail: `This ticket has been open for ${ageMinutes} minutes.`,
        ticketUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${ticket.id}`,
        eventType: 'TICKET_PARTICIPANT',
      });
      await this.enqueue({
        companyId: ticket.companyId,
        ticketId: ticket.id,
        userId: recipient.userId,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        eventType: `SLA_${level}`,
        eventCategory: 'sla',
        priority: 100,
        ...prepared,
      });
    }
  }

  private async ensurePreferences(userId: string): Promise<PreferenceRow> {
    const existing = await this.prisma.query<PreferenceRow[]>(
      `SELECT * FROM NotificationPreference WHERE userId = ? LIMIT 1`,
      [userId],
    );
    if (existing[0]) return existing[0];
    const id = randomUUID();
    const token = randomUUID().replaceAll('-', '');
    await this.prisma.execute(
      `INSERT IGNORE INTO NotificationPreference (
        id, userId, emailEnabled, pushEnabled, smsEnabled, digestDaily, settings,
        unsubscribeToken, digestHour, timezone, createdAt
      ) VALUES (?, ?, 1, 1, 0, 0, ?, ?, 8, 'UTC', NOW(3))`,
      [id, userId, JSON.stringify({ events: DEFAULT_EVENTS }), token],
    );
    const rows = await this.prisma.query<PreferenceRow[]>(
      `SELECT * FROM NotificationPreference WHERE userId = ? LIMIT 1`,
      [userId],
    );
    return rows[0];
  }

  private preferenceResponse(row: PreferenceRow) {
    const settings = this.parseSettings(row.settings);
    return {
      emailEnabled: this.asBoolean(row.emailEnabled),
      pushEnabled: this.asBoolean(row.pushEnabled),
      smsEnabled: this.asBoolean(row.smsEnabled),
      digestDaily: this.asBoolean(row.digestDaily),
      digestHour: Number(row.digestHour ?? 8),
      timezone: row.timezone || 'UTC',
      events: settings.events,
      criticalEvents: ['ticket_status', 'ticket_resolution', 'sla'],
    };
  }

  private parseSettings(value?: string | null) {
    const parsed = this.safeJson<Record<string, any>>(value, {});
    return { events: { ...DEFAULT_EVENTS, ...(parsed.events || {}) } };
  }

  private unsubscribeToken(email: string) {
    const normalized = this.normalizeEmail(email);
    const payload = Buffer.from(normalized).toString('base64url');
    const signature = createHmac('sha256', process.env.JWT_SECRET || 'fieldserviceit')
      .update(payload)
      .digest('base64url');
    return `${payload}.${signature}`;
  }

  private verifyUnsubscribeToken(token: string) {
    const [payload, signature] = String(token || '').split('.');
    if (!payload || !signature) return null;
    const expected = createHmac('sha256', process.env.JWT_SECRET || 'fieldserviceit')
      .update(payload)
      .digest('base64url');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    try {
      return this.normalizeEmail(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  private replaceTemplate(template: string, values: Record<string, string>, allowContentHtml: boolean) {
    return String(template).replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const value = values[key] || '';
      return allowContentHtml && key === 'content' ? value : this.escapeHtml(value);
    });
  }

  private replaceSubjectTemplate(template: string, values: Record<string, string>) {
    return String(template)
      .replace(/\{\{(\w+)\}\}/g, (_match, key) => values[key] || '')
      .replace(/[\r\n]+/g, ' ')
      .trim()
      .slice(0, 255);
  }

  private companyScope(user: CurrentUser) {
    if (user.role === 'SUPER_ADMIN' && !user.effectiveCompanyId && !user.companyId) return null;
    return user.effectiveCompanyId || user.companyId || null;
  }

  private requiredCompanyScope(user: CurrentUser) {
    const companyId = this.companyScope(user);
    if (!companyId) throw new BadRequestException('Select a company context first');
    return companyId;
  }

  private assertOperationsRole(user: CurrentUser) {
    if (!['SUPER_ADMIN', 'TENANT_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Email operations are restricted to administrators');
    }
  }

  private assertTemplateRole(user: CurrentUser) {
    this.assertOperationsRole(user);
  }

  private cleanEventType(value: string) {
    const clean = String(value || 'TICKET_PARTICIPANT').toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!clean) throw new BadRequestException('Invalid template type');
    return clean.slice(0, 64);
  }

  private normalizeEmail(value: string) {
    const email = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  private maskEmail(email: string) {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
  }

  private safeJson<T>(value: any, fallback: T): T {
    if (!value) return fallback;
    if (typeof value === 'object') return value as T;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private safeColor(value: string) {
    const color = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '#2563eb';
  }

  private sanitizeTemplateHtml(value: string) {
    return String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
      .replace(/javascript:/gi, '');
  }

  private validTimezone(value: string) {
    const timezone = String(value || 'UTC').slice(0, 64);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      return timezone;
    } catch {
      return 'UTC';
    }
  }

  private asBoolean(value: any) {
    return value === true || value === 1 || value === '1';
  }

  private escapeHtml(value: string) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
