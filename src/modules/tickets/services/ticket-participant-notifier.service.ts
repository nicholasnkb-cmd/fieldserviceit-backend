import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../common/logger/logger.service';
import { PrismaService } from '../../../database/prisma.service';
import { EmailService } from '../../notifications/services/email.service';

export type TicketParticipantNotification = {
  action: string;
  detail?: string;
  actorId?: string;
};

type Recipient = {
  email: string;
  name?: string | null;
};

@Injectable()
export class TicketParticipantNotifierService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
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
        { email: ticket.contactEmail || '', name: ticket.contactName },
        {
          email: ticket.createdBy?.email || '',
          name: ticket.createdBy
            ? [ticket.createdBy.firstName, ticket.createdBy.lastName].filter(Boolean).join(' ')
            : null,
        },
      ]);
      if (!recipients.length) {
        this.logger.warn(`[TicketParticipantNotifier] No email recipients for ticket ${ticket.ticketNumber}`);
        return;
      }

      const subject = `Ticket ${ticket.ticketNumber}: ${notification.action}`;
      const ticketUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${ticket.id}`;
      const results = await Promise.allSettled(recipients.map((recipient) => (
        this.emailService.sendNotificationEmail(
          recipient.email,
          subject,
          this.emailBody({
            recipient,
            ticketNumber: ticket.ticketNumber,
            ticketTitle: ticket.title,
            action: notification.action,
            detail: notification.detail,
            actorName,
            ticketUrl,
          }),
        )
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

  private uniqueRecipients(recipients: Recipient[]) {
    const unique = new Map<string, Recipient>();
    for (const recipient of recipients) {
      const email = recipient.email.trim().toLowerCase();
      if (email && !unique.has(email)) unique.set(email, { ...recipient, email });
    }
    return [...unique.values()];
  }

  private emailBody(input: {
    recipient: Recipient;
    ticketNumber: string;
    ticketTitle: string;
    action: string;
    detail?: string;
    actorName?: string | null;
    ticketUrl: string;
  }) {
    const greeting = input.recipient.name?.trim()
      ? `Hello ${this.escapeHtml(input.recipient.name.trim())},`
      : 'Hello,';
    const detail = input.detail?.trim()
      ? `<p><strong>Details:</strong><br>${this.escapeHtml(input.detail.trim()).replace(/\n/g, '<br>')}</p>`
      : '';
    const actor = input.actorName
      ? `<p><strong>Updated by:</strong> ${this.escapeHtml(input.actorName)}</p>`
      : '';

    return `
      <p>${greeting}</p>
      <p>An action was taken on a ticket you opened or are listed as the affected contact.</p>
      <p>
        <strong>Ticket:</strong> ${this.escapeHtml(input.ticketNumber)}<br>
        <strong>Title:</strong> ${this.escapeHtml(input.ticketTitle)}<br>
        <strong>Action:</strong> ${this.escapeHtml(input.action)}
      </p>
      ${detail}
      ${actor}
      <p><a href="${this.escapeHtml(input.ticketUrl)}">View ticket</a></p>
      <p>This is an automated FieldserviceIT notification.</p>
    `;
  }

  private escapeHtml(value: string) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
