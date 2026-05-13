import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(companyId: string | null, query: string, userType: string, userId: string) {
    const [tickets, assets] = await Promise.all([
      this.searchTickets(companyId, query, userType, userId),
      this.searchAssets(companyId, query),
    ]);

    return { tickets, assets };
  }

  private async searchTickets(companyId: string | null, query: string, userType: string, userId: string) {
    const where: any = {
      deletedAt: null,
      OR: [
        { title: { contains: query } },
        { ticketNumber: { contains: query } },
        { description: { contains: query } },
      ],
    };

    if (userType === 'PUBLIC') {
      where.createdById = userId;
    } else if (companyId) {
      where.companyId = companyId;
    }

    return this.prisma.ticket.findMany({
      where,
      take: 25,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        createdAt: true,
      },
    });
  }

  private async searchAssets(companyId: string | null, query: string) {
    if (!companyId) return [];

    return this.prisma.asset.findMany({
      where: {
        companyId,
        deletedAt: null,
        OR: [
          { name: { contains: query } },
          { serialNumber: { contains: query } },
          { ipAddress: { contains: query } },
          { model: { contains: query } },
          { location: { contains: query } },
        ],
      },
      take: 25,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        assetType: true,
        serialNumber: true,
        status: true,
        location: true,
      },
    });
  }
}
