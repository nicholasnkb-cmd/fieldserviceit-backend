import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  TENANT_ADMIN = 'TENANT_ADMIN',
  TECHNICIAN = 'TECHNICIAN',
  CLIENT = 'CLIENT',
  READ_ONLY = 'READ_ONLY',
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: { email: string; password: string; firstName: string; lastName: string; role?: UserRole }, companyId: string) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role ?? UserRole.CLIENT,
        passwordHash,
        companyId,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, companyId: true, createdAt: true },
    });
  }

  async findAll(companyId: string, query: { page?: number; limit?: number }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 25;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { companyId, deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
      }),
      this.prisma.user.count({ where: { companyId, deletedAt: null } }),
    ]);

    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, userType: true,
        phone: true, avatarUrl: true, companyId: true, isActive: true, lastLoginAt: true, createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getEffectiveFeatures(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    const company = user.companyId ? await this.prisma.company.findUnique({ where: { id: user.companyId } }) : null;
    const companySettings = company?.settings ? JSON.parse(company.settings) : {};
    const userOverrides = user.featureOverrides ? JSON.parse(user.featureOverrides) : {};
    return {
      companyId: user.companyId,
      features: {
        ...(companySettings.featureOverrides || {}),
        ...userOverrides,
      },
      userOverrides,
      companyOverrides: companySettings.featureOverrides || {},
    };
  }

  async listFavorites(userId: string) {
    return this.prisma.query<any[]>(
      `SELECT id, label, path, createdAt FROM UserPageFavorite WHERE userId = ? ORDER BY createdAt DESC`,
      [userId],
    );
  }

  async addFavorite(userId: string, dto: { label?: string; path?: string }) {
    const path = String(dto.path || '').trim();
    if (!path.startsWith('/')) throw new BadRequestException('Favorite path must start with /');
    const label = String(dto.label || path).trim().slice(0, 120);
    const existing = await this.prisma.query<any[]>(
      `SELECT * FROM UserPageFavorite WHERE userId = ? AND path = ? LIMIT 1`,
      [userId, path],
    );
    if (existing[0]) return existing[0];
    const id = `fav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.prisma.execute(
      `INSERT INTO UserPageFavorite (id, userId, label, path, createdAt) VALUES (?, ?, ?, ?, ?)`,
      [id, userId, label, path, new Date()],
    );
    const rows = await this.prisma.query<any[]>(`SELECT * FROM UserPageFavorite WHERE id = ? LIMIT 1`, [id]);
    return rows[0];
  }

  async removeFavorite(userId: string, path: string) {
    await this.prisma.execute(`DELETE FROM UserPageFavorite WHERE userId = ? AND path = ?`, [userId, path]);
    return { removed: true };
  }

  async findOne(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true, avatarUrl: true, isActive: true, lastLoginAt: true, createdAt: true },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: { firstName?: string; lastName?: string; phone?: string }, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.user.update({
      where: { id },
      data: { firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
  }

  async updateMe(id: string, dto: { firstName?: string; lastName?: string; phone?: string }) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id },
      data: { firstName: dto.firstName, lastName: dto.lastName, phone: dto.phone },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, companyId: true, createdAt: true },
    });
  }

  async changePassword(id: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) throw new BadRequestException('Password not set');
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.prisma.session.deleteMany({ where: { userId: id } });
    return { message: 'Password changed successfully' };
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
