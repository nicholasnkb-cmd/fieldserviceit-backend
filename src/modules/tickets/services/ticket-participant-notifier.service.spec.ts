import { TicketParticipantNotifierService } from './ticket-participant-notifier.service';

describe('TicketParticipantNotifierService', () => {
  let prisma: any;
  let emailDeliveryService: any;
  let logger: any;
  let service: TicketParticipantNotifierService;

  beforeEach(() => {
    prisma = {
      ticket: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      query: jest.fn().mockResolvedValue([]),
    };
    emailDeliveryService = {
      prepareTicketEmail: jest.fn().mockImplementation((input) => Promise.resolve({
        subject: `Ticket ${input.ticketNumber}: ${input.action}`,
        htmlBody: `<p>${input.detail || ''}</p>`,
        textBody: input.detail || '',
        senderName: 'FieldserviceIT',
        replyTo: null,
      })),
      enqueue: jest.fn().mockResolvedValue({ id: 'delivery-1', status: 'QUEUED' }),
    };
    logger = { warn: jest.fn(), error: jest.fn() };
    service = new TicketParticipantNotifierService(prisma, emailDeliveryService, logger);
  });

  it('queues separate deliveries for the opener and affected contact', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'ticket-1',
      companyId: 'company-1',
      ticketNumber: 'TKT-00001',
      title: 'Printer offline',
      contactName: 'Affected User',
      contactEmail: 'affected@example.com',
      createdBy: {
        id: 'opener-1',
        email: 'opener@example.com',
        firstName: 'Ticket',
        lastName: 'Opener',
      },
    });
    prisma.user.findUnique.mockResolvedValue({
      firstName: 'Taylor',
      lastName: 'Tech',
      email: 'tech@example.com',
    });

    await service.notify('ticket-1', {
      action: 'Status changed to IN PROGRESS',
      detail: 'A technician started work.',
      actorId: 'tech-1',
    });

    expect(emailDeliveryService.enqueue).toHaveBeenCalledTimes(2);
    expect(emailDeliveryService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: 'affected@example.com',
      ticketId: 'ticket-1',
      eventCategory: 'ticket_status',
    }));
    expect(emailDeliveryService.prepareTicketEmail).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: 'opener@example.com',
      actorName: 'Taylor Tech',
    }));
  });

  it('deduplicates the opener and contact when they share an email address', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'ticket-2',
      companyId: 'company-1',
      ticketNumber: 'TKT-00002',
      title: 'Access request',
      contactName: 'Same Person',
      contactEmail: 'same@example.com',
      createdBy: {
        id: 'opener-2',
        email: 'SAME@example.com',
        firstName: 'Same',
        lastName: 'Person',
      },
    });

    await service.notify('ticket-2', { action: 'Comment added' });

    expect(emailDeliveryService.enqueue).toHaveBeenCalledTimes(1);
    expect(emailDeliveryService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: 'same@example.com',
    }));
  });

  it('excludes the inbound email sender to prevent reply loops', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'ticket-3',
      companyId: null,
      ticketNumber: 'TKT-00003',
      title: 'Network issue',
      contactName: 'Affected User',
      contactEmail: 'affected@example.com',
      createdBy: {
        id: 'opener-3',
        email: 'opener@example.com',
        firstName: 'Ticket',
        lastName: 'Opener',
      },
    });

    await service.notify('ticket-3', {
      action: 'Reply received by email',
      excludeEmails: ['opener@example.com'],
    });

    expect(emailDeliveryService.enqueue).toHaveBeenCalledTimes(1);
    expect(emailDeliveryService.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmail: 'affected@example.com',
    }));
  });

  it('does not fail the ticket action when queueing a delivery fails', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'ticket-4',
      companyId: 'company-1',
      ticketNumber: 'TKT-00004',
      title: 'Network issue',
      contactName: 'Affected User',
      contactEmail: 'affected@example.com',
      createdBy: null,
    });
    emailDeliveryService.enqueue.mockRejectedValueOnce(new Error('Database unavailable'));

    await expect(service.notify('ticket-4', { action: 'Ticket assigned' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Database unavailable'));
  });
});
