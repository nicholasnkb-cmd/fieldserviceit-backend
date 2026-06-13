import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { CurrentUser } from '../../common/types';

const LOCATION_TYPES = ['WAREHOUSE', 'VAN', 'CUSTOMER_SITE', 'OTHER'];
const MOVEMENT_TYPES = ['RECEIVE', 'ADJUST', 'TRANSFER_IN', 'TRANSFER_OUT', 'RESERVE', 'USE', 'RETURN'];

@Injectable()
export class InventoryService {
  private schemaReady?: Promise<void>;

  constructor(private db: DatabaseService) {}

  async summary(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const where = scope.companyId ? 'WHERE companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    const [parts, lowStock, stock, reserved, poNeeded] = await Promise.all([
      this.db.query<any[]>(`SELECT COUNT(*) as count FROM InventoryPart ${where}`, values),
      this.db.query<any[]>(
        `SELECT COUNT(*) as count FROM InventoryPart WHERE ${scope.companyId ? 'companyId = ? AND ' : ''}quantityOnHand <= reorderPoint`,
        values,
      ),
      this.db.query<any[]>(`SELECT COALESCE(SUM(quantityOnHand * unitCost), 0) as value FROM InventoryPart ${where}`, values),
      this.db.query<any[]>(`SELECT COALESCE(SUM(quantityReserved), 0) as count FROM InventoryPart ${where}`, values),
      this.db.query<any[]>(
        `SELECT COUNT(*) as count FROM InventoryPart WHERE ${scope.companyId ? 'companyId = ? AND ' : ''}quantityOnHand <= reorderPoint AND reorderPoint > 0`,
        values,
      ),
    ]);
    return {
      partCount: Number(parts[0]?.count || 0),
      lowStockCount: Number(lowStock[0]?.count || 0),
      inventoryValue: Number(stock[0]?.value || 0),
      reservedCount: Number(reserved[0]?.count || 0),
      purchaseRequestCount: Number(poNeeded[0]?.count || 0),
    };
  }

  async listParts(user: CurrentUser, query: { search?: string; lowStock?: string; locationId?: string; limit?: string }) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const clauses: string[] = [];
    const values: any[] = [];
    if (scope.companyId) {
      clauses.push('p.companyId = ?');
      values.push(scope.companyId);
    }
    if (query.lowStock === 'true') clauses.push('p.quantityOnHand <= p.reorderPoint');
    if (query.locationId) {
      clauses.push('p.locationId = ?');
      values.push(query.locationId);
    }
    if (query.search) {
      clauses.push('(p.name LIKE ? OR p.sku LIKE ? OR p.category LIKE ? OR p.vendor LIKE ? OR p.description LIKE ?)');
      const term = `%${query.search}%`;
      values.push(term, term, term, term, term);
    }
    values.push(this.limit(query.limit));
    return this.db.query<any[]>(
      `SELECT p.*, l.name as locationName, l.locationType, c.name as companyName
       FROM InventoryPart p
       LEFT JOIN InventoryLocation l ON l.id = p.locationId
       LEFT JOIN Company c ON c.id = p.companyId
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY p.updatedAt DESC, p.createdAt DESC
       LIMIT ?`,
      values,
    );
  }

  async createPart(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    const data = await this.normalizePart(companyId, dto, true);
    const id = randomUUID();
    const now = new Date();
    await this.db.execute(
      `INSERT INTO InventoryPart
       (id, companyId, sku, name, description, category, vendor, manufacturer, model, locationId, unitCost, unitPrice, quantityOnHand, quantityReserved, reorderPoint, reorderQuantity, status, createdById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, companyId, data.sku, data.name, data.description, data.category, data.vendor, data.manufacturer, data.model,
        data.locationId, data.unitCost, data.unitPrice, data.quantityOnHand, 0, data.reorderPoint, data.reorderQuantity,
        data.status, user.id, now, now,
      ],
    );
    if (data.quantityOnHand > 0) {
      await this.logTransaction(companyId, id, data.locationId, 'RECEIVE', data.quantityOnHand, 'Initial stock', null, user.id);
    }
    return this.getPart(user, id);
  }

  async updatePart(user: CurrentUser, id: string, dto: any) {
    await this.ensureSchema();
    await this.getPart(user, id);
    const companyId = this.requireCompanyForWrite(user, dto.companyId);
    const data = await this.normalizePart(companyId, dto, false);
    const updates: Record<string, any> = { ...data, updatedAt: new Date() };
    const keys = Object.keys(updates).filter((key) => updates[key] !== undefined);
    if (keys.length) {
      await this.db.execute(
        `UPDATE InventoryPart SET ${keys.map((key) => `\`${key}\` = ?`).join(', ')} WHERE id = ? AND companyId = ?`,
        [...keys.map((key) => updates[key]), id, companyId],
      );
    }
    return this.getPart(user, id);
  }

  async listLocations(user: CurrentUser) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const where = scope.companyId ? 'WHERE companyId = ?' : '';
    const values = scope.companyId ? [scope.companyId] : [];
    return this.db.query<any[]>(`SELECT * FROM InventoryLocation ${where} ORDER BY locationType ASC, name ASC`, values);
  }

  async createLocation(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const companyId = this.resolveWriteCompany(user, dto.companyId);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Location name is required');
    const locationType = this.normalizeOption(dto.locationType || 'WAREHOUSE', LOCATION_TYPES, 'location type');
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO InventoryLocation (id, companyId, name, locationType, assignedToId, address, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, companyId, name, locationType, dto.assignedToId || null, dto.address?.trim() || null, new Date(), new Date()],
    );
    return (await this.db.query<any[]>('SELECT * FROM InventoryLocation WHERE id = ? LIMIT 1', [id]))[0];
  }

  async createMovement(user: CurrentUser, dto: any) {
    await this.ensureSchema();
    const part = await this.getPart(user, dto.partId);
    const movementType = this.normalizeOption(dto.movementType || dto.type, MOVEMENT_TYPES, 'movement type');
    const quantity = Math.max(0, Number(dto.quantity) || 0);
    if (quantity <= 0) throw new BadRequestException('Quantity must be greater than zero');
    const signed = this.signedQuantity(movementType, quantity);
    const available = Number(part.quantityOnHand || 0) - Number(part.quantityReserved || 0);
    if (['USE', 'TRANSFER_OUT'].includes(movementType) && quantity > available) {
      throw new BadRequestException('Not enough available stock');
    }
    if (movementType === 'RESERVE' && quantity > available) {
      throw new BadRequestException('Not enough available stock to reserve');
    }
    if (movementType === 'RETURN' && quantity > Number(part.quantityReserved || 0)) {
      throw new BadRequestException('Return quantity exceeds reserved stock');
    }

    const reservedDelta = movementType === 'RESERVE' ? quantity : movementType === 'USE' || movementType === 'RETURN' ? -quantity : 0;
    await this.db.execute(
      `UPDATE InventoryPart
       SET quantityOnHand = quantityOnHand + ?, quantityReserved = GREATEST(0, quantityReserved + ?), updatedAt = ?
       WHERE id = ? AND companyId = ?`,
      [signed, reservedDelta, new Date(), part.id, part.companyId],
    );
    await this.logTransaction(part.companyId, part.id, dto.locationId || part.locationId, movementType, quantity, dto.notes, dto.ticketId || null, user.id);
    return this.getPart(user, part.id);
  }

  async listTransactions(user: CurrentUser, query: { partId?: string; ticketId?: string; limit?: string }) {
    await this.ensureSchema();
    const scope = this.scopeFor(user);
    const clauses: string[] = [];
    const values: any[] = [];
    if (scope.companyId) {
      clauses.push('t.companyId = ?');
      values.push(scope.companyId);
    }
    if (query.partId) {
      clauses.push('t.partId = ?');
      values.push(query.partId);
    }
    if (query.ticketId) {
      clauses.push('t.ticketId = ?');
      values.push(query.ticketId);
    }
    values.push(this.limit(query.limit));
    return this.db.query<any[]>(
      `SELECT t.*, p.sku, p.name as partName, l.name as locationName, tk.ticketNumber
       FROM InventoryTransaction t
       LEFT JOIN InventoryPart p ON p.id = t.partId
       LEFT JOIN InventoryLocation l ON l.id = t.locationId
       LEFT JOIN Ticket tk ON tk.id = t.ticketId
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY t.createdAt DESC
       LIMIT ?`,
      values,
    );
  }

  private async getPart(user: CurrentUser, id: string) {
    const scope = this.scopeFor(user);
    const values: any[] = [id];
    const companyClause = scope.companyId ? 'AND p.companyId = ?' : '';
    if (scope.companyId) values.push(scope.companyId);
    const rows = await this.db.query<any[]>(
      `SELECT p.*, l.name as locationName, l.locationType, c.name as companyName
       FROM InventoryPart p
       LEFT JOIN InventoryLocation l ON l.id = p.locationId
       LEFT JOIN Company c ON c.id = p.companyId
       WHERE p.id = ? ${companyClause}
       LIMIT 1`,
      values,
    );
    if (!rows[0]) throw new NotFoundException('Inventory part not found');
    return rows[0];
  }

  private async normalizePart(companyId: string, dto: any, required: boolean) {
    const has = (key: string) => Object.prototype.hasOwnProperty.call(dto, key);
    const name = dto.name?.trim();
    if (required && !name) throw new BadRequestException('Part name is required');
    let locationId = has('locationId') ? dto.locationId || null : required ? await this.defaultLocation(companyId) : undefined;
    if (locationId) await this.assertLocation(companyId, locationId);
    return {
      sku: has('sku') ? dto.sku?.trim() || null : undefined,
      name: has('name') ? name || undefined : undefined,
      description: has('description') ? dto.description?.trim() || null : undefined,
      category: has('category') ? dto.category?.trim() || null : undefined,
      vendor: has('vendor') ? dto.vendor?.trim() || null : undefined,
      manufacturer: has('manufacturer') ? dto.manufacturer?.trim() || null : undefined,
      model: has('model') ? dto.model?.trim() || null : undefined,
      locationId,
      unitCost: has('unitCost') ? Math.max(0, Number(dto.unitCost) || 0) : required ? 0 : undefined,
      unitPrice: has('unitPrice') ? Math.max(0, Number(dto.unitPrice) || 0) : required ? 0 : undefined,
      quantityOnHand: has('quantityOnHand') ? Math.max(0, Number(dto.quantityOnHand) || 0) : required ? 0 : undefined,
      reorderPoint: has('reorderPoint') ? Math.max(0, Number(dto.reorderPoint) || 0) : required ? 0 : undefined,
      reorderQuantity: has('reorderQuantity') ? Math.max(0, Number(dto.reorderQuantity) || 0) : required ? 0 : undefined,
      status: has('status') ? dto.status?.trim() || 'ACTIVE' : required ? 'ACTIVE' : undefined,
    };
  }

  private async defaultLocation(companyId: string) {
    const existing = await this.db.query<any[]>('SELECT id FROM InventoryLocation WHERE companyId = ? AND locationType = ? LIMIT 1', [companyId, 'WAREHOUSE']);
    if (existing[0]) return existing[0].id;
    const location = await this.createLocation({ id: 'system', role: 'SUPER_ADMIN', userType: 'BUSINESS', companyId, isActive: true, email: 'system' }, { name: 'Main Warehouse', locationType: 'WAREHOUSE' });
    return location.id;
  }

  private async assertLocation(companyId: string, locationId: string) {
    const rows = await this.db.query<any[]>('SELECT id FROM InventoryLocation WHERE id = ? AND companyId = ? LIMIT 1', [locationId, companyId]);
    if (!rows[0]) throw new BadRequestException('Inventory location is not available');
  }

  private async logTransaction(companyId: string, partId: string, locationId: string | null, movementType: string, quantity: number, notes: string | null, ticketId: string | null, actorId: string) {
    await this.db.execute(
      `INSERT INTO InventoryTransaction (id, companyId, partId, locationId, movementType, quantity, notes, ticketId, actorId, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), companyId, partId, locationId, movementType, quantity, notes?.trim?.() || null, ticketId, actorId, new Date()],
    );
  }

  private signedQuantity(movementType: string, quantity: number) {
    if (['USE', 'TRANSFER_OUT'].includes(movementType)) return -quantity;
    if (movementType === 'RETURN') return 0;
    if (movementType === 'RESERVE') return 0;
    return quantity;
  }

  private scopeFor(user: CurrentUser) {
    if (user.companyId) return { companyId: user.companyId };
    if (user.role === 'SUPER_ADMIN') return { companyId: user.effectiveCompanyId || null };
    throw new ForbiddenException('Select a company context to manage inventory');
  }

  private resolveWriteCompany(user: CurrentUser, requestedCompanyId?: string) {
    if (user.companyId) return user.companyId;
    if (user.role === 'SUPER_ADMIN' && (user.effectiveCompanyId || requestedCompanyId)) return user.effectiveCompanyId || requestedCompanyId;
    throw new ForbiddenException('Select a company context before creating inventory records');
  }

  private requireCompanyForWrite(user: CurrentUser, requestedCompanyId?: string) {
    return this.resolveWriteCompany(user, requestedCompanyId);
  }

  private normalizeOption(value: string, allowed: string[], label: string) {
    const normalized = String(value || '').toUpperCase();
    if (!allowed.includes(normalized)) throw new BadRequestException(`Invalid ${label}`);
    return normalized;
  }

  private limit(value?: string) {
    return Math.min(Math.max(Number(value) || 50, 1), 200);
  }

  private ensureSchema() {
    if (!this.schemaReady) this.schemaReady = this.createSchema();
    return this.schemaReady;
  }

  private async createSchema() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS InventoryLocation (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        name VARCHAR(191) NOT NULL,
        locationType VARCHAR(32) DEFAULT 'WAREHOUSE',
        assignedToId VARCHAR(191),
        address TEXT,
        isActive TINYINT(1) DEFAULT 1,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId, locationType),
        INDEX(assignedToId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS InventoryPart (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        sku VARCHAR(128),
        name VARCHAR(191) NOT NULL,
        description TEXT,
        category VARCHAR(128),
        vendor VARCHAR(191),
        manufacturer VARCHAR(191),
        model VARCHAR(191),
        locationId VARCHAR(191),
        unitCost DECIMAL(12,2) DEFAULT 0,
        unitPrice DECIMAL(12,2) DEFAULT 0,
        quantityOnHand DECIMAL(12,2) DEFAULT 0,
        quantityReserved DECIMAL(12,2) DEFAULT 0,
        reorderPoint DECIMAL(12,2) DEFAULT 0,
        reorderQuantity DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(32) DEFAULT 'ACTIVE',
        createdById VARCHAR(191),
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE(companyId, sku),
        INDEX(companyId, name),
        INDEX(companyId, category),
        INDEX(companyId, locationId),
        INDEX(companyId, status)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS InventoryTransaction (
        id VARCHAR(191) PRIMARY KEY,
        companyId VARCHAR(191) NOT NULL,
        partId VARCHAR(191) NOT NULL,
        locationId VARCHAR(191),
        movementType VARCHAR(32) NOT NULL,
        quantity DECIMAL(12,2) NOT NULL,
        notes TEXT,
        ticketId VARCHAR(191),
        actorId VARCHAR(191),
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX(companyId, createdAt),
        INDEX(partId),
        INDEX(ticketId),
        INDEX(locationId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
  }
}
