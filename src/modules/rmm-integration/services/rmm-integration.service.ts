import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { RmmProviderFactory } from './rmm-provider-factory.service';
import { TicketTimelineService } from '../../tickets/services/ticket-timeline.service';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { TicketsGateway } from '../../tickets/events/tickets.gateway';

@Injectable()
export class RmmIntegrationService {
  private readonly logger = new Logger(RmmIntegrationService.name);

  constructor(
    private prisma: PrismaService,
    private providerFactory: RmmProviderFactory,
    private timeline: TicketTimelineService,
    private notificationsService: NotificationsService,
    private gateway: TicketsGateway,
  ) {}

  async syncAsset(provider: string, assetData: any, companyId: string) {
    const rmmProvider = this.providerFactory.getProvider(provider);
    const mapped = await rmmProvider.syncAsset(assetData);

    const name = mapped.name || assetData.name || 'Unknown Asset';
    const assetType = mapped.assetType || assetData.assetType || 'OTHER';
    const serialNumber = mapped.serialNumber || assetData.serialNumber;
    const manufacturer = mapped.manufacturer || assetData.manufacturer;
    const model = mapped.model || assetData.model;
    const os = mapped.os || assetData.os;
    const ipAddress = mapped.ipAddress || assetData.ipAddress;
    const location = mapped.location || assetData.location;
    const status = mapped.status || assetData.status || 'ACTIVE';

    if (serialNumber) {
      const existing = await this.prisma.asset.findFirst({
        where: { serialNumber, companyId, deletedAt: null },
      });
      if (existing) {
        return this.prisma.asset.update({
          where: { id: existing.id },
          data: { name, assetType, manufacturer, model, os, ipAddress, location, status },
        });
      }
    }

    return this.prisma.asset.create({
      data: { name, assetType, serialNumber, manufacturer, model, os, ipAddress, location, status, companyId },
    });
  }

  async createTicketFromAlert(provider: string, alert: any, companyId: string) {
    const rmmProvider = this.providerFactory.getProvider(provider);
    const mapped = await rmmProvider.createAlert(alert);

    const title = mapped.title || alert.title || `[${provider}] RMM Alert`;
    const description = mapped.description || alert.description || '';
    const priority = this.mapPriority(mapped.severity || alert.severity);

    let userId = alert.assignedUserId;
    if (!userId) {
      const tenantAdmin = await this.prisma.user.findFirst({
        where: { companyId, role: 'TENANT_ADMIN', deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      userId = tenantAdmin?.id;
    }
    if (!userId) {
      const firstUser = await this.prisma.user.findFirst({
        where: { companyId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      userId = firstUser?.id;
    }
    if (!userId) throw new Error('No user found in company to create ticket');

    const ticketCount = await this.prisma.ticket.count({ where: { companyId } });
    const shortId = companyId.slice(0, 4).toUpperCase();
    const ticketNumber = `TKT-${shortId}-${(ticketCount + 1).toString().padStart(5, '0')}`;

    const sourceInfo = mapped.deviceName
      ? `Device: ${mapped.deviceName}\nAlert ID: ${mapped.alertId || 'N/A'}\nSource: ${mapped.source || provider}`
      : `Alert ID: ${mapped.alertId || 'N/A'}\nSource: ${mapped.source || provider}`;
    const fullDescription = description
      ? `${description}\n\n---\n${sourceInfo}`
      : sourceInfo;

    const ticket = await this.prisma.ticket.create({
      data: {
        title,
        description: fullDescription,
        ticketNumber,
        type: 'INCIDENT',
        priority,
        companyId,
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await this.timeline.addEntry(
      ticket.id,
      userId,
      'RMM_ALERT',
      `Ticket auto-created from ${provider} alert: ${title}`,
    );

    // Notify tenant admins and technicians
    const notifyUsers = await this.prisma.user.findMany({
      where: {
        companyId,
        role: { in: ['TENANT_ADMIN', 'TECHNICIAN'] },
        isActive: true,
        deletedAt: null,
      },
    });

    for (const u of notifyUsers) {
      await this.notificationsService.create({
        userId: u.id,
        companyId,
        title: `[${provider}] New alert ticket: ${ticketNumber}`,
        body: title,
        type: 'info',
        link: `/tickets/${ticket.id}`,
      });
    }

    this.gateway.notifyTicketUpdate(companyId, 'ticket:created', ticket);

    this.logger.log(`Created ticket ${ticketNumber} from ${provider} alert: ${title}`);
    return ticket;
  }

  private mapPriority(severity?: string): string {
    if (!severity) return 'MEDIUM';
    const s = severity.toLowerCase();
    if (s === 'critical' || s === 'emergency') return 'CRITICAL';
    if (s === 'warning' || s === 'high') return 'HIGH';
    if (s === 'info' || s === 'low') return 'LOW';
    return 'MEDIUM';
  }
}
