import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser } from '../../common/types';

const STATUSES = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'];
const VISIBILITIES = ['INTERNAL', 'CUSTOMER', 'PUBLIC'];
const ARTICLE_TYPES = ['ARTICLE', 'RUNBOOK', 'FAQ', 'TROUBLESHOOTING'];

type ArticlePayload = {
  title?: string;
  summary?: string;
  content?: string;
  category?: string;
  tags?: string[] | string;
  status?: string;
  visibility?: string;
  articleType?: string;
  aiEnabled?: boolean;
  sourceTicketId?: string;
  ownerId?: string;
  reviewDueAt?: string | null;
};

@Injectable()
export class KnowledgeBaseService {
  constructor(private db: DatabaseService) {}

  async summary(user: CurrentUser) {
    const companyId = this.requireCompany(user);
    const [statusRows, categoryRows, staleRows] = await Promise.all([
      this.db.query<any[]>(
        `SELECT status, COUNT(*) as count FROM KbArticle WHERE companyId = ? GROUP BY status`,
        [companyId],
      ),
      this.db.query<any[]>(
        `SELECT COALESCE(NULLIF(category, ''), 'Uncategorized') as category, COUNT(*) as count
         FROM KbArticle WHERE companyId = ? GROUP BY COALESCE(NULLIF(category, ''), 'Uncategorized') ORDER BY count DESC`,
        [companyId],
      ),
      this.db.query<any[]>(
        `SELECT COUNT(*) as count FROM KbArticle
         WHERE companyId = ? AND reviewDueAt IS NOT NULL AND reviewDueAt < NOW(3) AND status <> 'ARCHIVED'`,
        [companyId],
      ),
    ]);

    const statuses = statusRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status || 'DRAFT'] = Number(row.count || 0);
      return acc;
    }, {});

    return {
      statuses,
      categories: categoryRows.map((row) => ({ category: row.category, count: Number(row.count || 0) })),
      staleCount: Number(staleRows[0]?.count || 0),
    };
  }

  async findAll(user: CurrentUser, query: { search?: string; category?: string; status?: string; visibility?: string; aiEnabled?: string; limit?: string }) {
    const companyId = this.requireCompany(user);
    const clauses = ['a.companyId = ?'];
    const values: any[] = [companyId];

    if (query.status) {
      clauses.push('a.status = ?');
      values.push(this.normalizeOption(query.status, STATUSES, 'status'));
    }
    if (query.visibility) {
      clauses.push('a.visibility = ?');
      values.push(this.normalizeOption(query.visibility, VISIBILITIES, 'visibility'));
    }
    if (query.category) {
      clauses.push('a.category = ?');
      values.push(query.category);
    }
    if (query.aiEnabled === 'true' || query.aiEnabled === 'false') {
      clauses.push('a.aiEnabled = ?');
      values.push(query.aiEnabled === 'true' ? 1 : 0);
    }
    if (query.search) {
      clauses.push('(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ? OR a.tags LIKE ?)');
      const term = `%${query.search}%`;
      values.push(term, term, term, term);
    }

    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 200);
    values.push(limit);
    const rows = await this.db.query<any[]>(
      `SELECT a.*, u.firstName as ownerFirstName, u.lastName as ownerLastName, t.ticketNumber as sourceTicketNumber, t.title as sourceTicketTitle
       FROM KbArticle a
       LEFT JOIN User u ON u.id = a.ownerId
       LEFT JOIN Ticket t ON t.id = a.sourceTicketId
       WHERE ${clauses.join(' AND ')}
       ORDER BY a.updatedAt DESC, a.createdAt DESC
       LIMIT ?`,
      values,
    );

    return rows.map((row) => this.mapArticle(row));
  }

  async findOne(id: string, user: CurrentUser) {
    const article = await this.getArticle(id, user);
    return this.mapArticle(article);
  }

  async create(dto: ArticlePayload, user: CurrentUser) {
    const companyId = this.requireCompany(user);
    const data = this.normalizePayload(dto, true);
    const id = randomUUID();
    const now = new Date();
    await this.db.execute(
      `INSERT INTO KbArticle
       (id, companyId, title, summary, content, category, tags, status, visibility, articleType, aiEnabled, sourceTicketId, ownerId, createdById, updatedById, reviewDueAt, publishedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        data.title,
        data.summary,
        data.content,
        data.category,
        data.tags,
        data.status,
        data.visibility,
        data.articleType,
        data.aiEnabled ? 1 : 0,
        data.sourceTicketId,
        data.ownerId || user.id,
        user.id,
        user.id,
        data.reviewDueAt,
        data.status === 'PUBLISHED' ? now : null,
        now,
        now,
      ],
    );
    return this.findOne(id, user);
  }

  async update(id: string, dto: ArticlePayload, user: CurrentUser) {
    const existing = await this.getArticle(id, user);
    const data = this.normalizePayload(dto, false);
    const updates: Record<string, any> = { ...data, updatedById: user.id, updatedAt: new Date() };
    if (data.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') updates.publishedAt = new Date();
    if (data.status && data.status !== 'PUBLISHED') updates.publishedAt = null;

    const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
    if (keys.length === 0) return this.mapArticle(existing);
    await this.db.execute(
      `UPDATE KbArticle SET ${keys.map((key) => `${this.escapeColumn(key)} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map((key) => updates[key]), id],
    );
    return this.findOne(id, user);
  }

  async remove(id: string, user: CurrentUser) {
    await this.getArticle(id, user);
    await this.db.execute(`UPDATE KbArticle SET status = 'ARCHIVED', updatedById = ?, updatedAt = ? WHERE id = ?`, [user.id, new Date(), id]);
    return { success: true };
  }

  async createFromTicket(ticketId: string, user: CurrentUser) {
    const companyId = this.requireCompany(user);
    const rows = await this.db.query<any[]>(
      `SELECT id, ticketNumber, title, description, category, subcategory, resolution
       FROM Ticket
       WHERE id = ? AND companyId = ? AND deletedAt IS NULL
       LIMIT 1`,
      [ticketId, companyId],
    );
    const ticket = rows[0];
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (!ticket.resolution && !ticket.description) {
      throw new BadRequestException('Ticket needs a description or resolution before creating an article');
    }

    return this.create({
      title: ticket.title,
      summary: `Created from ticket ${ticket.ticketNumber}.`,
      content: [
        'Issue',
        ticket.description || 'No description provided.',
        '',
        'Resolution',
        ticket.resolution || 'Add the verified resolution steps before publishing.',
      ].join('\n'),
      category: ticket.category || 'General',
      tags: [ticket.subcategory, ticket.ticketNumber].filter(Boolean),
      status: 'DRAFT',
      visibility: 'INTERNAL',
      articleType: 'ARTICLE',
      sourceTicketId: ticket.id,
    }, user);
  }

  private async getArticle(id: string, user: CurrentUser) {
    const companyId = this.requireCompany(user);
    const rows = await this.db.query<any[]>(
      `SELECT a.*, u.firstName as ownerFirstName, u.lastName as ownerLastName, t.ticketNumber as sourceTicketNumber, t.title as sourceTicketTitle
       FROM KbArticle a
       LEFT JOIN User u ON u.id = a.ownerId
       LEFT JOIN Ticket t ON t.id = a.sourceTicketId
       WHERE a.id = ? AND a.companyId = ?
       LIMIT 1`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('Knowledge article not found');
    return rows[0];
  }

  private normalizePayload(dto: ArticlePayload, requireContent: boolean) {
    const title = dto.title?.trim();
    const content = dto.content?.trim();
    if (requireContent && !title) throw new BadRequestException('Title is required');
    if (requireContent && !content) throw new BadRequestException('Content is required');
    const has = (key: keyof ArticlePayload) => Object.prototype.hasOwnProperty.call(dto, key);

    return {
      title: has('title') ? title || undefined : undefined,
      summary: has('summary') ? dto.summary?.trim() || null : undefined,
      content: has('content') ? content || undefined : undefined,
      category: has('category') ? dto.category?.trim() || null : undefined,
      tags: has('tags') ? this.normalizeTags(dto.tags) : undefined,
      status: dto.status ? this.normalizeOption(dto.status, STATUSES, 'status') : requireContent ? 'DRAFT' : undefined,
      visibility: dto.visibility ? this.normalizeOption(dto.visibility, VISIBILITIES, 'visibility') : requireContent ? 'INTERNAL' : undefined,
      articleType: dto.articleType ? this.normalizeOption(dto.articleType, ARTICLE_TYPES, 'article type') : requireContent ? 'ARTICLE' : undefined,
      aiEnabled: has('aiEnabled') ? Boolean(dto.aiEnabled) : requireContent ? false : undefined,
      sourceTicketId: has('sourceTicketId') ? dto.sourceTicketId || null : undefined,
      ownerId: has('ownerId') ? dto.ownerId || null : undefined,
      reviewDueAt: has('reviewDueAt') ? dto.reviewDueAt ? new Date(dto.reviewDueAt) : null : undefined,
    };
  }

  private normalizeTags(tags?: string[] | string) {
    if (Array.isArray(tags)) return tags.map((tag) => tag.trim()).filter(Boolean).slice(0, 12).join(',');
    if (typeof tags === 'string') return tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12).join(',');
    return undefined;
  }

  private normalizeOption(value: string, allowed: string[], label: string) {
    const normalized = value.toUpperCase();
    if (!allowed.includes(normalized)) throw new BadRequestException(`Invalid ${label}`);
    return normalized;
  }

  private mapArticle(row: any) {
    return {
      ...row,
      aiEnabled: Boolean(row.aiEnabled),
      tags: typeof row.tags === 'string' && row.tags ? row.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean) : [],
      owner: row.ownerId ? { id: row.ownerId, firstName: row.ownerFirstName, lastName: row.ownerLastName } : null,
      sourceTicket: row.sourceTicketId ? { id: row.sourceTicketId, ticketNumber: row.sourceTicketNumber, title: row.sourceTicketTitle } : null,
    };
  }

  private requireCompany(user: CurrentUser) {
    if (!user.companyId) throw new ForbiddenException('Select a company context to manage the knowledge base');
    return user.companyId;
  }

  private escapeColumn(column: string) {
    return `\`${column.replace(/`/g, '``')}\``;
  }
}
