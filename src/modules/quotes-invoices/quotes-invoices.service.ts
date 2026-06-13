import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser } from '../../common/types';

const QUOTE_STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'DECLINED', 'EXPIRED', 'CONVERTED'];
const INVOICE_STATUSES = ['DRAFT', 'SENT', 'PARTIAL', 'PAID', 'VOID', 'OVERDUE'];

type LinePayload = {
  description?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  taxable?: boolean;
};

@Injectable()
export class QuotesInvoicesService {
  private schemaReady?: Promise<void>;

  constructor(private db: DatabaseService) {}

  async summary(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const quoteWhere = scope.companyId ? 'WHERE companyId = ?' : '';
    const invoiceWhere = scope.companyId ? 'WHERE companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    const [quoteRows, invoiceRows, totals] = await Promise.all([
      this.db.query<any[]>(`SELECT status, COUNT(*) as count FROM ServiceQuote ${quoteWhere} GROUP BY status`, values),
      this.db.query<any[]>(`SELECT status, COUNT(*) as count FROM ServiceInvoice ${invoiceWhere} GROUP BY status`, values),
      this.db.query<any[]>(
        `SELECT
          COALESCE(SUM(CASE WHEN status IN ('SENT','PARTIAL','OVERDUE') THEN total ELSE 0 END), 0) as openInvoiceTotal,
          COALESCE(SUM(CASE WHEN status = 'PAID' THEN total ELSE 0 END), 0) as paidInvoiceTotal
         FROM ServiceInvoice ${invoiceWhere}`,
        values,
      ),
    ]);

    return {
      quotes: this.countsByStatus(quoteRows),
      invoices: this.countsByStatus(invoiceRows),
      openInvoiceTotal: Number(totals[0]?.openInvoiceTotal || 0),
      paidInvoiceTotal: Number(totals[0]?.paidInvoiceTotal || 0),
    };
  }

  async listQuotes(user: CurrentUser, query: { status?: string; search?: string; limit?: string }) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const clauses: string[] = [];
    const values: any[] = [];
    if (scope.companyId) {
      clauses.push('q.companyId = ?');
      values.push(scope.companyId);
    }
    if (query.status && query.status !== 'ALL') {
      clauses.push('q.status = ?');
      values.push(this.normalizeOption(query.status, QUOTE_STATUSES, 'quote status'));
    }
    if (query.search) {
      clauses.push('(q.quoteNumber LIKE ? OR q.title LIKE ? OR q.customerName LIKE ? OR q.customerEmail LIKE ? OR t.ticketNumber LIKE ?)');
      const term = `%${query.search}%`;
      values.push(term, term, term, term, term);
    }
    const limit = this.limit(query.limit);
    values.push(limit);
    const rows = await this.db.query<any[]>(
      `SELECT q.*, c.name as companyName, t.ticketNumber, t.title as ticketTitle
       FROM ServiceQuote q
       LEFT JOIN Company c ON c.id = q.companyId
       LEFT JOIN Ticket t ON t.id = q.ticketId
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY q.updatedAt DESC, q.createdAt DESC
       LIMIT ?`,
      values,
    );
    return this.withQuoteLines(rows);
  }

  async createQuote(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    const data = this.normalizeDocumentPayload(dto, true);
    const lines = this.normalizeLines(dto.lines);
    const totals = this.calculateTotals(lines, data.taxRate, data.discountTotal);
    const id = randomUUID();
    const now = new Date();
    await this.db.execute(
      `INSERT INTO ServiceQuote
       (id, companyId, quoteNumber, title, customerName, customerEmail, customerPhone, ticketId, status, currency, subtotal, taxRate, taxTotal, discountTotal, total, notes, terms, validUntil, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        await this.nextNumber(companyId, 'QUOTE'),
        data.title,
        data.customerName,
        data.customerEmail,
        data.customerPhone,
        data.ticketId,
        data.status || 'DRAFT',
        data.currency,
        totals.subtotal,
        data.taxRate,
        totals.taxTotal,
        data.discountTotal,
        totals.total,
        data.notes,
        data.terms,
        data.validUntil,
        user.id,
        now,
        now,
      ],
    );
    await this.replaceQuoteLines(id, lines, data.taxRate);
    return this.getQuote(user, id);
  }

  async updateQuote(user: CurrentUser, id: string, dto: any) {
    await this.ensureSchema();
    const existing = await this.getQuote(user, id);
    if (existing.status === 'CONVERTED' && dto.lines) {
      throw new BadRequestException('Converted quotes cannot have line items changed');
    }
    const data = this.normalizeDocumentPayload(dto, false);
    const updates: Record<string, any> = { ...data, updatedAt: new Date() };
    if (dto.status) {
      updates.status = this.normalizeOption(dto.status, QUOTE_STATUSES, 'quote status');
      if (updates.status === 'APPROVED') updates.approvedAt = new Date();
    }
    if (Array.isArray(dto.lines)) {
      const lines = this.normalizeLines(dto.lines);
      const totals = this.calculateTotals(lines, data.taxRate ?? Number(existing.taxRate || 0), data.discountTotal ?? Number(existing.discountTotal || 0));
      Object.assign(updates, totals);
      await this.replaceQuoteLines(id, lines, data.taxRate ?? Number(existing.taxRate || 0));
    }
    await this.applyUpdates('ServiceQuote', id, existing.companyId, updates);
    return this.getQuote(user, id);
  }

  async convertQuoteToInvoice(user: CurrentUser, id: string, dto: any) {
    await this.ensureSchema();
    const quote = await this.getQuote(user, id);
    if (quote.convertedInvoiceId) return this.getInvoice(user, quote.convertedInvoiceId);
    if (!quote.lines?.length) throw new BadRequestException('Quote needs at least one line item before conversion');
    const invoiceId = randomUUID();
    const now = new Date();
    await this.db.execute(
      `INSERT INTO ServiceInvoice
       (id, companyId, invoiceNumber, quoteId, ticketId, title, customerName, customerEmail, customerPhone, status, currency, subtotal, taxRate, taxTotal, discountTotal, total, balanceDue, notes, terms, dueAt, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceId,
        quote.companyId,
        await this.nextNumber(quote.companyId, 'INVOICE'),
        quote.id,
        quote.ticketId,
        dto.title?.trim() || quote.title,
        quote.customerName,
        quote.customerEmail,
        quote.customerPhone,
        'DRAFT',
        quote.currency || 'USD',
        Number(quote.subtotal || 0),
        Number(quote.taxRate || 0),
        Number(quote.taxTotal || 0),
        Number(quote.discountTotal || 0),
        Number(quote.total || 0),
        Number(quote.total || 0),
        dto.notes?.trim() || quote.notes,
        dto.terms?.trim() || quote.terms,
        dto.dueAt ? new Date(dto.dueAt) : null,
        user.id,
        now,
        now,
      ],
    );
    await this.replaceInvoiceLines(invoiceId, quote.lines);
    await this.db.execute(
      `UPDATE ServiceQuote SET status = 'CONVERTED', convertedInvoiceId = ?, updatedAt = ? WHERE id = ? AND companyId = ?`,
      [invoiceId, now, quote.id, quote.companyId],
    );
    return this.getInvoice(user, invoiceId);
  }

  async listInvoices(user: CurrentUser, query: { status?: string; search?: string; limit?: string }) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const clauses: string[] = [];
    const values: any[] = [];
    if (scope.companyId) {
      clauses.push('i.companyId = ?');
      values.push(scope.companyId);
    }
    if (query.status && query.status !== 'ALL') {
      clauses.push('i.status = ?');
      values.push(this.normalizeOption(query.status, INVOICE_STATUSES, 'invoice status'));
    }
    if (query.search) {
      clauses.push('(i.invoiceNumber LIKE ? OR i.title LIKE ? OR i.customerName LIKE ? OR i.customerEmail LIKE ? OR t.ticketNumber LIKE ?)');
      const term = `%${query.search}%`;
      values.push(term, term, term, term, term);
    }
    const limit = this.limit(query.limit);
    values.push(limit);
    const rows = await this.db.query<any[]>(
      `SELECT i.*, c.name as companyName, t.ticketNumber, t.title as ticketTitle, q.quoteNumber
       FROM ServiceInvoice i
       LEFT JOIN Company c ON c.id = i.companyId
       LEFT JOIN Ticket t ON t.id = i.ticketId
       LEFT JOIN ServiceQuote q ON q.id = i.quoteId
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY i.updatedAt DESC, i.createdAt DESC
       LIMIT ?`,
      values,
    );
    return this.withInvoiceLines(rows);
  }

  async updateInvoice(user: CurrentUser, id: string, dto: any) {
    await this.ensureSchema();
    const existing = await this.getInvoice(user, id);
    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const key of ['title', 'customerName', 'customerEmail', 'customerPhone', 'notes', 'terms'] as const) {
      if (dto[key] !== undefined) updates[key] = dto[key]?.trim?.() || null;
    }
    if (dto.status) {
      updates.status = this.normalizeOption(dto.status, INVOICE_STATUSES, 'invoice status');
      if (updates.status === 'SENT') updates.sentAt = new Date();
      if (updates.status === 'PAID') {
        updates.paidAt = new Date();
        updates.balanceDue = 0;
      }
      if (updates.status === 'VOID') updates.balanceDue = 0;
    }
    if (dto.dueAt !== undefined) updates.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.amountPaid !== undefined) {
      const invoice = await this.getInvoice(user, id);
      const paid = Math.max(0, Number(dto.amountPaid) || 0);
      updates.amountPaid = paid;
      updates.balanceDue = Math.max(0, Number(invoice.total || 0) - paid);
      if (updates.balanceDue === 0) {
        updates.status = 'PAID';
        updates.paidAt = new Date();
      } else if (paid > 0) {
        updates.status = 'PARTIAL';
      }
    }
    await this.applyUpdates('ServiceInvoice', id, existing.companyId, updates);
    return this.getInvoice(user, id);
  }

  private async getQuote(user: CurrentUser, id: string) {
    const scope = this.scopeFor(user);
    const values: any[] = [id];
    const companyClause = scope.companyId ? 'AND q.companyId = ?' : '';
    if (scope.companyId) values.push(scope.companyId);
    const rows = await this.db.query<any[]>(
      `SELECT q.*, c.name as companyName, t.ticketNumber, t.title as ticketTitle
       FROM ServiceQuote q
       LEFT JOIN Company c ON c.id = q.companyId
       LEFT JOIN Ticket t ON t.id = q.ticketId
       WHERE q.id = ? ${companyClause}
       LIMIT 1`,
      values,
    );
    if (!rows[0]) throw new NotFoundException('Quote not found');
    return (await this.withQuoteLines(rows))[0];
  }

  private async getInvoice(user: CurrentUser, id: string) {
    const scope = this.scopeFor(user);
    const values: any[] = [id];
    const companyClause = scope.companyId ? 'AND i.companyId = ?' : '';
    if (scope.companyId) values.push(scope.companyId);
    const rows = await this.db.query<any[]>(
      `SELECT i.*, c.name as companyName, t.ticketNumber, t.title as ticketTitle, q.quoteNumber
       FROM ServiceInvoice i
       LEFT JOIN Company c ON c.id = i.companyId
       LEFT JOIN Ticket t ON t.id = i.ticketId
       LEFT JOIN ServiceQuote q ON q.id = i.quoteId
       WHERE i.id = ? ${companyClause}
       LIMIT 1`,
      values,
    );
    if (!rows[0]) throw new NotFoundException('Invoice not found');
    return (await this.withInvoiceLines(rows))[0];
  }

  private async withQuoteLines(rows: any[]) {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const lineRows = await this.db.query<any[]>(
      `SELECT * FROM ServiceQuoteLine WHERE quoteId IN (${ids.map(() => '?').join(',')}) ORDER BY position ASC, createdAt ASC`,
      ids,
    );
    return rows.map((row) => this.mapDocument(row, lineRows.filter((line) => line.quoteId === row.id), 'quote'));
  }

  private async withInvoiceLines(rows: any[]) {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const lineRows = await this.db.query<any[]>(
      `SELECT * FROM ServiceInvoiceLine WHERE invoiceId IN (${ids.map(() => '?').join(',')}) ORDER BY position ASC, createdAt ASC`,
      ids,
    );
    return rows.map((row) => this.mapDocument(row, lineRows.filter((line) => line.invoiceId === row.id), 'invoice'));
  }

  private normalizeDocumentPayload(dto: any, required: boolean) {
    const has = (key: string) => Object.prototype.hasOwnProperty.call(dto, key);
    const title = dto.title?.trim();
    if (required && !title) throw new BadRequestException('Title is required');
    return {
      title: has('title') ? title || undefined : undefined,
      customerName: has('customerName') ? dto.customerName?.trim() || null : undefined,
      customerEmail: has('customerEmail') ? dto.customerEmail?.trim() || null : undefined,
      customerPhone: has('customerPhone') ? dto.customerPhone?.trim() || null : undefined,
      ticketId: has('ticketId') ? dto.ticketId || null : undefined,
      status: dto.status ? this.normalizeOption(dto.status, QUOTE_STATUSES, 'quote status') : required ? 'DRAFT' : undefined,
      currency: has('currency') ? dto.currency?.trim() || 'USD' : required ? 'USD' : undefined,
      taxRate: has('taxRate') ? Math.max(0, Number(dto.taxRate) || 0) : required ? 0 : undefined,
      discountTotal: has('discountTotal') ? Math.max(0, Number(dto.discountTotal) || 0) : required ? 0 : undefined,
      notes: has('notes') ? dto.notes?.trim() || null : undefined,
      terms: has('terms') ? dto.terms?.trim() || null : undefined,
      validUntil: has('validUntil') ? dto.validUntil ? new Date(dto.validUntil) : null : undefined,
    };
  }

  private normalizeLines(lines: LinePayload[]) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException('At least one line item is required');
    }
    return lines.map((line, index) => {
      const description = line.description?.trim();
      if (!description) throw new BadRequestException('Line item description is required');
      const quantity = Math.max(0, Number(line.quantity) || 0);
      const unitPrice = Math.max(0, Number(line.unitPrice) || 0);
      if (quantity <= 0) throw new BadRequestException('Line item quantity must be greater than zero');
      return {
        id: randomUUID(),
        position: index + 1,
        description,
        quantity,
        unitPrice,
        taxable: line.taxable !== false,
        total: this.round(quantity * unitPrice),
      };
    }).slice(0, 100);
  }

  private calculateTotals(lines: any[], taxRate = 0, discountTotal = 0) {
    const subtotal = this.round(lines.reduce((sum, line) => sum + line.total, 0));
    const taxableSubtotal = this.round(lines.filter((line) => line.taxable).reduce((sum, line) => sum + line.total, 0));
    const taxTotal = this.round(Math.max(0, taxableSubtotal - discountTotal) * (Number(taxRate || 0) / 100));
    const total = this.round(Math.max(0, subtotal - discountTotal + taxTotal));
    return { subtotal, taxTotal, total };
  }

  private async replaceQuoteLines(quoteId: string, lines: any[], taxRate: number) {
    await this.db.execute('DELETE FROM ServiceQuoteLine WHERE quoteId = ?', [quoteId]);
    for (const line of lines) {
      await this.db.execute(
        `INSERT INTO ServiceQuoteLine (id, quoteId, position, description, quantity, unitPrice, taxable, total, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [line.id, quoteId, line.position, line.description, line.quantity, line.unitPrice, line.taxable ? 1 : 0, line.total, new Date()],
      );
    }
  }

  private async replaceInvoiceLines(invoiceId: string, lines: any[]) {
    await this.db.execute('DELETE FROM ServiceInvoiceLine WHERE invoiceId = ?', [invoiceId]);
    for (const line of lines) {
      await this.db.execute(
        `INSERT INTO ServiceInvoiceLine (id, invoiceId, position, description, quantity, unitPrice, taxable, total, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [randomUUID(), invoiceId, line.position, line.description, Number(line.quantity), Number(line.unitPrice), line.taxable ? 1 : 0, Number(line.total), new Date()],
      );
    }
  }

  private async nextNumber(companyId: string, type: 'QUOTE' | 'INVOICE') {
    const table = type === 'QUOTE' ? 'ServiceQuote' : 'ServiceInvoice';
    const column = type === 'QUOTE' ? 'quoteNumber' : 'invoiceNumber';
    const prefix = type === 'QUOTE' ? 'Q' : 'INV';
    const year = new Date().getFullYear();
    const rows = await this.db.query<any[]>(
      `SELECT COUNT(*) as count FROM ${table} WHERE companyId = ? AND ${column} LIKE ?`,
      [companyId, `${prefix}-${year}-%`],
    );
    return `${prefix}-${year}-${String(Number(rows[0]?.count || 0) + 1).padStart(5, '0')}`;
  }

  private async applyUpdates(table: string, id: string, companyId: string, updates: Record<string, any>) {
    const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
    if (!keys.length) return;
    await this.db.execute(
      `UPDATE ${table} SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ? AND companyId = ?`,
      [...keys.map((key) => updates[key]), id, companyId],
    );
  }

  private mapDocument(row: any, lines: any[], type: 'quote' | 'invoice') {
    return {
      ...row,
      subtotal: Number(row.subtotal || 0),
      taxRate: Number(row.taxRate || 0),
      taxTotal: Number(row.taxTotal || 0),
      discountTotal: Number(row.discountTotal || 0),
      total: Number(row.total || 0),
      amountPaid: Number(row.amountPaid || 0),
      balanceDue: Number(row.balanceDue || 0),
      lines: lines.map((line) => ({
        ...line,
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
        total: Number(line.total || 0),
        taxable: Boolean(line.taxable),
      })),
      company: row.companyId ? { id: row.companyId, name: row.companyName || null } : null,
      ticket: row.ticketId ? { id: row.ticketId, ticketNumber: row.ticketNumber, title: row.ticketTitle } : null,
      quote: type === 'invoice' && row.quoteId ? { id: row.quoteId, quoteNumber: row.quoteNumber } : undefined,
    };
  }

  private countsByStatus(rows: any[]) {
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = Number(row.count || 0);
      return acc;
    }, {});
  }

  private scopeFor(user: CurrentUser) {
    if (user.companyId) return { companyId: user.companyId };
    if (user.role === 'SUPER_ADMIN') return { companyId: user.effectiveCompanyId || null };
    throw new ForbiddenException('Select a company context to manage quotes and invoices');
  }

  private resolveWriteCompany(user: CurrentUser, requestedCompanyId?: string) {
    if (user.companyId) return user.companyId;
    if (user.role === 'SUPER_ADMIN' && (user.effectiveCompanyId || requestedCompanyId)) {
      return user.effectiveCompanyId || requestedCompanyId;
    }
    throw new ForbiddenException('Select a company context before creating quotes or invoices');
  }

  private normalizeOption(value: string, allowed: string[], label: string) {
    const normalized = String(value).toUpperCase();
    if (!allowed.includes(normalized)) throw new BadRequestException(`Invalid ${label}`);
    return normalized;
  }

  private limit(value?: string) {
    return Math.min(Math.max(Number(value) || 50, 1), 200);
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = this.createSchema();
    }
    return this.schemaReady;
  }

  private async createSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ServiceQuote (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        quoteNumber VARCHAR(64) NOT NULL,
        title VARCHAR(191) NOT NULL,
        customerName VARCHAR(191),
        customerEmail VARCHAR(191),
        customerPhone VARCHAR(64),
        ticketId VARCHAR(191),
        status VARCHAR(32) DEFAULT 'DRAFT',
        currency VARCHAR(8) DEFAULT 'USD',
        subtotal DECIMAL(12,2) DEFAULT 0,
        taxRate DECIMAL(8,4) DEFAULT 0,
        taxTotal DECIMAL(12,2) DEFAULT 0,
        discountTotal DECIMAL(12,2) DEFAULT 0,
        total DECIMAL(12,2) DEFAULT 0,
        notes TEXT,
        terms TEXT,
        validUntil DATETIME(3),
        approvedAt DATETIME(3),
        convertedInvoiceId VARCHAR(191),
        createdById VARCHAR(191),
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE(companyId, quoteNumber),
        INDEX(companyId, status, updatedAt),
        INDEX(ticketId),
        INDEX(customerEmail)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ServiceQuoteLine (
        id VARCHAR(191) PRIMARY KEY,
        quoteId VARCHAR(191) NOT NULL,
        position INT DEFAULT 1,
        description TEXT NOT NULL,
        quantity DECIMAL(12,2) DEFAULT 1,
        unitPrice DECIMAL(12,2) DEFAULT 0,
        taxable TINYINT(1) DEFAULT 1,
        total DECIMAL(12,2) DEFAULT 0,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(quoteId),
        INDEX(position)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ServiceInvoice (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        invoiceNumber VARCHAR(64) NOT NULL,
        quoteId VARCHAR(191),
        ticketId VARCHAR(191),
        title VARCHAR(191) NOT NULL,
        customerName VARCHAR(191),
        customerEmail VARCHAR(191),
        customerPhone VARCHAR(64),
        status VARCHAR(32) DEFAULT 'DRAFT',
        currency VARCHAR(8) DEFAULT 'USD',
        subtotal DECIMAL(12,2) DEFAULT 0,
        taxRate DECIMAL(8,4) DEFAULT 0,
        taxTotal DECIMAL(12,2) DEFAULT 0,
        discountTotal DECIMAL(12,2) DEFAULT 0,
        total DECIMAL(12,2) DEFAULT 0,
        amountPaid DECIMAL(12,2) DEFAULT 0,
        balanceDue DECIMAL(12,2) DEFAULT 0,
        notes TEXT,
        terms TEXT,
        dueAt DATETIME(3),
        sentAt DATETIME(3),
        paidAt DATETIME(3),
        createdById VARCHAR(191),
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE(companyId, invoiceNumber),
        INDEX(companyId, status, updatedAt),
        INDEX(quoteId),
        INDEX(ticketId),
        INDEX(customerEmail),
        INDEX(dueAt)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ServiceInvoiceLine (
        id VARCHAR(191) PRIMARY KEY,
        invoiceId VARCHAR(191) NOT NULL,
        position INT DEFAULT 1,
        description TEXT NOT NULL,
        quantity DECIMAL(12,2) DEFAULT 1,
        unitPrice DECIMAL(12,2) DEFAULT 0,
        taxable TINYINT(1) DEFAULT 1,
        total DECIMAL(12,2) DEFAULT 0,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(invoiceId),
        INDEX(position)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
  }
}
