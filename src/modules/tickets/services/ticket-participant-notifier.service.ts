import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../common/logger/logger.service';
import { PrismaService } from '../../../database/prisma.service';
import { EmailDeliveryService } from '../../notifications/services/email-delivery.service';

export type TicketParticipantNotification = {
  action: string;
  detail?: string;
  actorId?: string;
  eventCategory?: string;
  eventType?: string;
  excludeEmails?: string[];
};

type Recipient = {
  email: string;
  name?: string | null;
  userId?: string | null;
};

@Injectable()
export class TicketParticipantNotifierService {
  constructor(
    private prisma: PrismaService,
    private emailDeliveryService: EmailDeliveryService,
    private readonly logger: LoggerService,
  ) {}

  async notify(ticketId: string, notification: TicketParticipantNotification) {
    try {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });
      if (!ticket) {
        this.logger.warn(`[TicketParticipantNotifier] Ticket ${ticketId} not found`);
        return;
      }

      const actor = notification.actorId
        ? await this.prisma.user.findUnique({
            where: { id: notification.actorId },
            select: { firstName: true, lastName: true, email: true },
          })
        : null;
      const actorName = actor
        ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email
        : null;
      const recipients = this.uniqueRecipients([
        { email: ticket.contactEmail || '', name: ticket.contactName, userId: null },
        {
          email: ticket.createdBy?.email || '',
          name: ticket.createdBy
            ? [ticket.createdBy.firstName, ticket.createdBy.lastName].filter(Boolean).join(' ')
            : null,
          userId: ticket.createdBy?.id || null,
        },
      ]).filter((recipient) => !notification.excludeEmails?.some(
        (email) => email.trim().toLowerCase() === recipient.email,
      ));
      if (!recipients.length) {
        this.logger.warn(`[TicketParticipantNotifier] No email recipients for ticket ${ticket.ticketNumber}`);
        return;
      }

      const ticketUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${ticket.id}`;
      const results = await Promise.allSettled(recipients.map((recipient) => (
        this.queueRecipient({
          ticket,
          recipient,
          notification,
          actorName,
          ticketUrl,
        })
      )));

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(
            `[TicketParticipantNotifier] Failed to email ${recipients[index].email} for ticket ${ticket.ticketNumber}: ${result.reason?.message || result.reason}`,
          );
        }
      });
    } catch (error: any) {
      this.logger.error(
        `[TicketParticipantNotifier] Failed to prepare notification for ticket ${ticketId}: ${error?.message || error}`,
      );
    }
  }

  private async queueRecipient(input: {
    ticket: any;
    recipient: Recipient;
    notification: TicketParticipantNotification;
    actorName?: string | null;
    ticketUrl: string;
  }) {
    let userId = input.recipient.userId || null;
    if (!userId) {
      const matches = await this.prisma.query<any[]>(
        `SELECT id FROM User WHERE LOWER(email) = ? AND deletedAt IS NULL LIMIT 1`,
        [input.recipient.email],
      );
      userId = matches[0]?.id || null;
    }
    const eventType = input.notification.eventType || 'TICKET_PARTICIPANT';
    const eventCategory = input.notification.eventCategory || this.inferCategory(input.notification.action);
    const prepared = await this.emailDeliveryService.prepareTicketEmail({
      companyId: input.ticket.companyId,
      recipientEmail: input.recipient.email,
      recipientName: input.recipient.name,
      ticketNumber: input.ticket.ticketNumber,
      ticketTitle: input.ticket.title,
      action: input.notification.action,
      detail: input.notification.detail,
      actorName: input.actorName,
      ticketUrl: input.ticketUrl,
      eventType,
    });
    return this.emailDeliveryService.enqueue({
      companyId: input.ticket.companyId,
      ticketId: input.ticket.id,
      userId,
      recipientEmail: input.recipient.email,
      recipientName: input.recipient.name,
      eventType,
      eventCategory,
      ...prepared,
    });
  }

  private uniqueRecipients(recipients: Recipient[]) {
    const unique = new Map<string, Recipient>();
    for (const recipient of recipients) {
      const email = recipient.email.trim().toLowerCase();
      if (email && !unique.has(email)) unique.set(email, { ...recipient, email });
    }
    return [...unique.values()];
  }

  private inferCategory(action: string) {
    const value = action.toLowerCase();
    if (value.includes('resolved') || value.includes('closed')) return 'ticket_resolution';
    if (value.includes('status') || value.includes('reopened')) return 'ticket_status';
    if (value.includes('comment') || value.includes('message') || value.includes('reply')) return 'ticket_comments';
    if (value.includes('assign') || value.includes('technician')) return 'ticket_assignment';
    if (value.includes('attachment') || value.includes('file')) return 'ticket_attachments';
    if (value.includes('time') || value.includes('work log')) return 'ticket_time';
    if (value.includes('dispatch') || value.includes('visit') || value.includes('arrival')) return 'dispatch';
    if (value.includes('opened') || value.includes('created')) return 'ticket_created';
    return 'automated';
  }
}
