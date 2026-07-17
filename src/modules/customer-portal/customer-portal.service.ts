import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser } from '../../common/types';
import { TicketParticipantNotifierService } from '../tickets/services/ticket-participant-notifier.service';

@Injectable()
export class CustomerPortalService {
  private schemaReady?: Promise<void>;

  constructor(
    private db: DatabaseService,
    private participantNotifier: TicketParticipantNotifierService,
  ) {}

  async summary(user: CurrentUser) {
    await this.ensureSchema();
    const { clauses, values } = this.ticketScope(user, 't');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [statusRows, feedbackRows] = await Promise.all([
      this.db.query<any[]>(
        `SELECT t.status, COUNT(*) as count FROM Ticket t ${where} GROUP BY t.status`,
        values,
      ),
      this.db.query<any[]>(
        `SELECT
          COUNT(*) as totalFeedback,
          COALESCE(AVG(rating), 0) as averageRating,
          SUM(CASE WHEN approved = 1 THEN 1 ELSE 0 END) as signedOff
         FROM TicketCustomerFeedback f
         LEFT JOIN Ticket t ON t.id = f.ticketId
         ${where}`,
        values,
      ),
    ]);
    const byStatus = statusRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = Number(row.count || 0);
      return acc;
    }, {});
    const feedback = feedbackRows[0] || {};
    return {
      byStatus,
      openRequests: Number(byStatus.OPEN || 0) + Number(byStatus.ASSIGNED || 0) + Number(byStatus.IN_PROGRESS || 0),
      pendingApprovals: Number(byStatus.RESOLVED || 0),
      signedOff: Number(feedback.signedOff || 0),
      averageRating: Number(feedback.averageRating || 0),
      totalFeedback: Number(feedback.totalFeedback || 0),
    };
  }

  async listFeedback(user: CurrentUser) {
    await this.ensureSchema();
    const { clauses, values } = this.ticketScope(user, 't');
    const rows = await this.db.query<any[]>(
      `SELECT f.*, t.ticketNumber, t.title
       FROM TicketCustomerFeedback f
       LEFT JOIN Ticket t ON t.id = f.ticketId
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY f.updatedAt DESC
       LIMIT 100`,
      values,
    );
    return rows.map((row) => ({ ...row, approved: Boolean(row.approved), rating: Number(row.rating || 0) }));
  }

  async overview(user: CurrentUser) {
    const { clauses, values } = this.ticketScope(user, 't');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [visits, documents, invoices, quotes] = await Promise.all([
      this.db.query<any[]>(
        `SELECT d.id, d.status, d.scheduledAt, d.arrivedAt, d.completedAt,
           t.id ticketId, t.ticketNumber, t.title,
           CONCAT(u.firstName, ' ', u.lastName) technicianName
         FROM Dispatch d INNER JOIN Ticket t ON t.id = d.ticketId
         LEFT JOIN User u ON u.id = d.technicianId
         ${where} AND d.status NOT IN ('COMPLETED', 'CANCELLED')
         ORDER BY COALESCE(d.scheduledAt, d.createdAt) ASC LIMIT 20`,
        values,
      ),
      this.db.query<any[]>(
        `SELECT a.id, a.ticketId, a.fileName, a.fileUrl, a.mimeType, a.fileSize, a.createdAt, t.ticketNumber
         FROM TicketAttachment a INNER JOIN Ticket t ON t.id = a.ticketId
         ${where} ORDER BY a.createdAt DESC LIMIT 50`,
        values,
      ),
      this.db.query<any[]>(
        `SELECT i.id, i.invoiceNumber, i.ticketId, i.title, i.status, i.currency, i.total, i.balanceDue, i.dueAt, i.paidAt, t.ticketNumber
         FROM ServiceInvoice i INNER JOIN Ticket t ON t.id = i.ticketId
         ${where} AND i.status <> 'DRAFT' ORDER BY i.createdAt DESC LIMIT 50`,
        values,
      ),
      this.db.query<any[]>(
        `SELECT q.id, q.quoteNumber, q.ticketId, q.title, q.status, q.currency, q.total, q.validUntil, q.approvedAt, t.ticketNumber
         FROM ServiceQuote q INNER JOIN Ticket t ON t.id = q.ticketId
         ${where} AND q.status IN ('SENT', 'APPROVED', 'REJECTED') ORDER BY q.createdAt DESC LIMIT 50`,
        values,
      ),
    ]);
    return { upcomingVisits: visits, documents, invoices, quotes };
  }

  async addCustomerMessage(ticketId: string, dto: any, user: CurrentUser) {
    await this.ensureSchema();
    const ticket = await this.assertTicketAccess(ticketId, user);
    const message = dto.message?.trim();
    if (!message) throw new BadRequestException('Message is required');
    const evidenceLinks = Array.isArray(dto.evidenceLinks)
      ? dto.evidenceLinks.map((item: string) => item.trim()).filter(Boolean).slice(0, 10)
      : [];
    const comment = [message, ...evidenceLinks.map((link: string) => `Evidence: ${link}`)].join('\n');
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO TicketTimeline (id, ticketId, action, actorId, comment, isInternal, createdAt)
       VALUES (?, ?, 'COMMENT', ?, ?, 0, ?)`,
      [id, ticket.id, user.id, comment, new Date()],
    );
    await this.participantNotifier.notify(ticket.id, {
      action: 'Customer message added',
      detail: comment,
      actorId: user.id,
    });
    return { id, ticketId: ticket.id, comment };
  }

  async saveFeedback(ticketId: string, dto: any, user: CurrentUser) {
    await this.ensureSchema();
    const ticket = await this.assertTicketAccess(ticketId, user);
    const rating = Math.min(5, Math.max(1, Number(dto.rating) || 5));
    const signOffName = dto.signOffName?.trim() || `${user.email}`;
    const comment = dto.comment?.trim() || null;
    const approved = dto.approved === false ? 0 : 1;
    const existing = await this.db.query<any[]>(
      'SELECT id FROM TicketCustomerFeedback WHERE ticketId = ? AND userId = ? LIMIT 1',
      [ticket.id, user.id],
    );
    if (existing[0]) {
      await this.db.execute(
        `UPDATE TicketCustomerFeedback
         SET rating = ?, signOffName = ?, comment = ?, approved = ?, updatedAt = ?
         WHERE id = ?`,
        [rating, signOffName, comment, approved, new Date(), existing[0].id],
      );
      const updated = (await this.db.query<any[]>('SELECT * FROM TicketCustomerFeedback WHERE id = ? LIMIT 1', [existing[0].id]))[0];
      await this.participantNotifier.notify(ticket.id, {
        action: 'Customer feedback updated',
        detail: `Rating: ${rating}/5\nApproved: ${approved ? 'Yes' : 'No'}${comment ? `\nComment: ${comment}` : ''}`,
        actorId: user.id,
      });
      return updated;
    }
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO TicketCustomerFeedback
       (id, ticketId, companyId, userId, rating, signOffName, comment, approved, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, ticket.id, ticket.companyId || null, user.id, rating, signOffName, comment, approved, new Date(), new Date()],
    );
    await this.db.execute(
      `INSERT INTO TicketTimeline (id, ticketId, action, actorId, comment, isInternal, createdAt)
       VALUES (?, ?, 'CUSTOMER_SIGNOFF', ?, ?, 0, ?)`,
      [randomUUID(), ticket.id, user.id, `Customer sign-off captured by ${signOffName} with ${rating}/5 rating.`, new Date()],
    );
    await this.participantNotifier.notify(ticket.id, {
      action: 'Customer sign-off recorded',
      detail: `Rating: ${rating}/5\nApproved: ${approved ? 'Yes' : 'No'}${comment ? `\nComment: ${comment}` : ''}`,
      actorId: user.id,
    });
    return (await this.db.query<any[]>('SELECT * FROM TicketCustomerFeedback WHERE id = ? LIMIT 1', [id]))[0];
  }

  private async assertTicketAccess(ticketId: string, user: CurrentUser) {
    const { clauses, values } = this.ticketScope(user, 't');
    const rows = await this.db.query<any[]>(
      `SELECT t.id, t.companyId, t.createdById
       FROM Ticket t
       WHERE t.id = ? AND t.deletedAt IS NULL ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}
       LIMIT 1`,
      [ticketId, ...values],
    );
    if (!rows[0]) throw new NotFoundException('Ticket not found');
    return rows[0];
  }

  private ticketScope(user: CurrentUser, alias = 't') {
    const clauses = [`${alias}.deletedAt IS NULL`];
    const values: any[] = [];
    const companyId = user.effectiveCompanyId || user.companyId;
    if (user.role === 'SUPER_ADMIN' && !companyId) {
      return { clauses, values };
    }
    if (user.role === 'GLOBAL_TECH') {
      clauses.push(`(${alias}.companyId IS NULL OR EXISTS (SELECT 1 FROM User u WHERE u.id = ${alias}.createdById AND u.userType = 'PUBLIC'))`);
      return { clauses, values };
    }
    if (user.userType === 'PUBLIC') {
      clauses.push(`${alias}.createdById = ?`);
      values.push(user.id);
      return { clauses, values };
    }
    clauses.push(`${alias}.companyId = ?`);
    values.push(companyId);
    return { clauses, values };
  }

  private ensureSchema() {
    if (!this.schemaReady) this.schemaReady = this.createSchema();
    return this.schemaReady;
  }

  private async createSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS TicketCustomerFeedback (
        id VARCHAR(191) PRIMARY KEY,
        ticketId VARCHAR(191) NOT NULL,
        companyId VARCHAR(191),
        userId VARCHAR(191) NOT NULL,
        rating INT DEFAULT 5,
        signOffName VARCHAR(191),
        comment TEXT,
        approved TINYINT(1) DEFAULT 1,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE(ticketId, userId),
        INDEX(companyId, updatedAt),
        INDEX(ticketId),
        INDEX(userId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
  }
}
