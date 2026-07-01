import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { RowDataPacket } from 'mysql2/promise';
import { PrismaService } from '../../database/prisma.service';
import { CreateCatalogRequestDto } from './dto/create-catalog-request.dto';
import { UpdateCatalogRequestDto } from './dto/update-catalog-request.dto';

@Injectable()
export class CatalogRequestsService {
  constructor(private prisma: PrismaService) {}

  async findCatalogItems(user: any, query: any) {
    const values: any[] = [];
    const where = ['isActive = 1'];
    const companyId = user.companyId || user.effectiveCompanyId || null;

    if (companyId) {
      where.push('(companyId IS NULL OR companyId = ?)');
      values.push(companyId);
    } else {
      where.push('companyId IS NULL');
    }

    if (query.requestType) {
      where.push('requestType = ?');
      values.push(query.requestType);
    }

    if (query.category) {
      where.push('category = ?');
      values.push(query.category);
    }

    if (query.search) {
      where.push('(name LIKE ? OR shortDescription LIKE ? OR description LIKE ? OR category LIKE ?)');
      const term = `%${query.search}%`;
      values.push(term, term, term, term);
    }

    const rows = await this.prisma.query<RowDataPacket[]>(
      `SELECT * FROM CatalogItem WHERE ${where.join(' AND ')} ORDER BY requestType ASC, sortOrder ASC, name ASC`,
      values,
    );

    return rows.map((row) => this.mapCatalogItem(row));
  }

  async findCatalogCategories(user: any) {
    const values: any[] = [];
    const companyId = user.companyId || user.effectiveCompanyId || null;
    const where = ['isActive = 1'];

    if (companyId) {
      where.push('(companyId IS NULL OR companyId = ?)');
      values.push(companyId);
    } else {
      where.push('companyId IS NULL');
    }

    const rows = await this.prisma.query<RowDataPacket[]>(
      `SELECT requestType, category, COUNT(*) as itemCount
       FROM CatalogItem
       WHERE ${where.join(' AND ')}
       GROUP BY requestType, category
       ORDER BY requestType ASC, category ASC`,
      values,
    );

    return rows.map((row) => ({
      requestType: row.requestType,
      category: row.category,
      itemCount: Number(row.itemCount || 0),
    }));
  }

  async create(dto: CreateCatalogRequestDto, companyId: string | null, userId: string) {
    const catalogItem = dto.catalogItemId ? await this.findCatalogItemForRequest(dto.catalogItemId, companyId) : null;
    const requestType = dto.requestType || catalogItem?.requestType;
    const title = dto.title || catalogItem?.name;

    if (!requestType || !title) {
      throw new BadRequestException('Choose a catalog item or provide a request type and title');
    }

    const request = await this.prisma.catalogRequest.create({
      data: this.cleanData({
        catalogItemId: catalogItem?.id || dto.catalogItemId || null,
        requestType,
        title,
        description: dto.description || catalogItem?.description,
        itemName: dto.itemName || catalogItem?.name,
        quantity: dto.quantity,
        justification: dto.justification,
        priority: dto.priority || catalogItem?.defaultPriority || 'MEDIUM',
        companyId,
        createdById: userId,
      }),
    });
    return request;
  }

  async findAll(user: any, query: any) {
    const where: Record<string, any> = {};
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    if (query.status) where.status = query.status;
    if (query.requestType) where.requestType = query.requestType;
    if (user.userType !== 'BUSINESS' && user.role !== 'SUPER_ADMIN') {
      where.createdById = user.id;
    }
    if (user.role !== 'SUPER_ADMIN' && user.companyId) {
      where.companyId = user.companyId;
    } else if (user.role === 'SUPER_ADMIN') {
      const effectiveCompanyId = query.companyId || user.effectiveCompanyId || user.companyId;
      if (effectiveCompanyId) where.companyId = effectiveCompanyId;
    }

    const [requests, total] = await Promise.all([
      this.prisma.catalogRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.catalogRequest.count({ where }),
    ]);

    return {
      data: requests,
      meta: { page, totalPages: Math.ceil(total / limit), total },
    };
  }

  async findOne(id: string, user: any) {
    const request = await this.prisma.catalogRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Catalog request not found');
    if (user.role !== 'SUPER_ADMIN' && user.companyId && request.companyId !== user.companyId) {
      throw new ForbiddenException('Not authorized to view this request');
    }
    if (user.userType !== 'BUSINESS' && user.role !== 'SUPER_ADMIN' && request.createdById !== user.id) {
      throw new ForbiddenException('Not authorized to view this request');
    }
    return request;
  }

  async update(id: string, dto: UpdateCatalogRequestDto, user: any) {
    const existing = await this.findOne(id, user);
    if (existing.createdById !== user.id && user.role !== 'SUPER_ADMIN' && user.role !== 'TENANT_ADMIN') {
      throw new ForbiddenException('Not authorized to update this request');
    }
    return this.prisma.catalogRequest.update({
      where: { id },
      data: { ...dto, updatedAt: new Date() },
    });
  }

  async remove(id: string, user: any) {
    const existing = await this.findOne(id, user);
    if (existing.createdById !== user.id && user.role !== 'SUPER_ADMIN' && user.role !== 'TENANT_ADMIN') {
      throw new ForbiddenException('Not authorized to delete this request');
    }
    await this.prisma.catalogRequest.delete({ where: { id } });
    return { message: 'Catalog request deleted' };
  }

  async approve(id: string, userId: string, user: any) {
    const existing = await this.findOne(id, user);
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be approved');
    }
    return this.prisma.catalogRequest.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: userId, approvedAt: new Date(), updatedAt: new Date() },
    });
  }

  async reject(id: string, reason: string, user: any) {
    const existing = await this.findOne(id, user);
    if (existing.status !== 'PENDING') {
      throw new BadRequestException('Only pending requests can be rejected');
    }
    return this.prisma.catalogRequest.update({
      where: { id },
      data: { status: 'REJECTED', rejectionReason: reason, approvedById: user.id, approvedAt: new Date(), updatedAt: new Date() },
    });
  }

  async fulfill(id: string, user: any) {
    const existing = await this.findOne(id, user);
    if (existing.status !== 'APPROVED') {
      throw new BadRequestException('Only approved requests can be fulfilled');
    }
    return this.prisma.catalogRequest.update({
      where: { id },
      data: { status: 'FULFILLED', fulfilledAt: new Date(), updatedAt: new Date() },
    });
  }

  private async findCatalogItemForRequest(id: string, companyId: string | null) {
    const values = companyId ? [id, companyId] : [id];
    const rows = await this.prisma.query<RowDataPacket[]>(
      `SELECT * FROM CatalogItem WHERE id = ? AND isActive = 1 AND ${companyId ? '(companyId IS NULL OR companyId = ?)' : 'companyId IS NULL'} LIMIT 1`,
      values,
    );
    if (!rows[0]) throw new NotFoundException('Catalog item not found');
    return this.mapCatalogItem(rows[0]);
  }

  private mapCatalogItem(row: any) {
    let formSchema: any = null;
    if (row.formSchema) {
      try { formSchema = JSON.parse(row.formSchema); } catch { formSchema = null; }
    }
    return {
      ...row,
      requiresApproval: Boolean(row.requiresApproval),
      isActive: Boolean(row.isActive),
      sortOrder: Number(row.sortOrder || 0),
      formSchema,
    };
  }

  private cleanData(data: Record<string, any>) {
    return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === undefined ? null : value]));
  }
}
