import { TicketParticipantNotifierService } from './ticket-participant-notifier.service';

describe('TicketParticipantNotifierService', () => {
  let prisma: any;
  let emailService: any;
  let logger: any;
  let service: TicketParticipantNotifierService;

  beforeEach(() => {
    prisma = {
      ticket: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    emailService = {
      sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
    };
    logger = {
      warn: jest.fn(),
      error: jest.fn(),
    };
    service = new TicketParticipantNotifierService(prisma, emailService, logger);
  });

  it('emails the opener and affected contact separately', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'ticket-1',
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

    expect(emailService.sendNotificationEmail).toHaveBeenCalledTimes(2);
    expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
      'affected@example.com',
      'Ticket TKT-00001: Status changed to IN PROGRESS',
      expect.stringContaining('A technician started work.'),
    );
    expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
      'opener@example.com',
      'Ticket TKT-00001: Status changed to IN PROGRESS',
      expect.stringContaining('Taylor Tech'),
    );
  });

  it('deduplicates the opener and contact when they share an email address', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'ticket-2',
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

    expect(emailService.sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendNotificationEmail).toHaveBeenCalledWith(
      'same@example.com',
      expect.any(String),
      expect.any(String),
    );
  });

  it('does not fail the ticket action when one email delivery fails', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'ticket-3',
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
    emailService.sendNotificationEmail
      .mockRejectedValueOnce(new Error('SMTP unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(service.notify('ticket-3', { action: 'Ticket assigned' })).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SMTP unavailable'));
  });

  it('escapes ticket and action content before rendering email HTML', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      id: 'ticket-4',
      ticketNumber: 'TKT-00004',
      title: '<script>alert(1)</script>',
      contactName: 'Affected User',
      contactEmail: 'affected@example.com',
      createdBy: null,
    });

    await service.notify('ticket-4', {
      action: 'Comment added',
      detail: '<img src=x onerror=alert(1)>',
    });

    const html = emailService.sendNotificationEmail.mock.calls[0][2];
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });
});
