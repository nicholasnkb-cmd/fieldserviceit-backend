import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import * as bcrypt from 'bcryptjs';

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
    const passwordHash = await bcrypt.hash(dto.password, 10);

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

  async findOne(id: string, companyId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true, avatarUrl: true, isActive: true, lastLoginAt: true, createdAt: true },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: any, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
  }

  async updateMe(id: string, dto: { firstName?: string; lastName?: string; phone?: string }) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, role: true, companyId: true, createdAt: true },
    });
  }

  async changePassword(id: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordHash) throw new BadRequestException('Password not set');
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
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
