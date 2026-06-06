import { EmailDeliveryService } from './email-delivery.service';

describe('EmailDeliveryService', () => {
  let prisma: any;
  let emailService: any;
  let logger: any;
  let service: EmailDeliveryService;

  beforeEach(() => {
    prisma = {
      query: jest.fn(),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    };
    emailService = {
      sendNotificationEmail: jest.fn().mockResolvedValue({ messageId: 'smtp-1' }),
      getStatus: jest.fn().mockReturnValue({ configured: true }),
    };
    logger = { error: jest.fn() };
    service = new EmailDeliveryService(prisma, emailService, logger);
  });

  it('queues optional email when the recipient preference allows it', async () => {
    prisma.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'pref-1',
        userId: 'user-1',
        emailEnabled: 1,
        digestDaily: 0,
        settings: JSON.stringify({ events: { ticket_comments: true } }),
      }]);

    const result = await service.enqueue({
      userId: 'user-1',
      recipientEmail: 'User@Example.com',
      eventType: 'TICKET_PARTICIPANT',
      eventCategory: 'ticket_comments',
      subject: 'Ticket updated',
      htmlBody: '<p>Updated</p>',
    });

    expect(result.status).toBe('QUEUED');
    expect(prisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO EmailDelivery'),
      expect.arrayContaining(['user@example.com', 'QUEUED']),
    );
  });

  it('puts optional updates into the daily digest', async () => {
    prisma.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 'pref-1',
        userId: 'user-1',
        emailEnabled: 1,
        digestDaily: 1,
        settings: JSON.stringify({ events: { ticket_comments: true } }),
      }]);

    const result = await service.enqueue({
      userId: 'user-1',
      recipientEmail: 'user@example.com',
      eventType: 'TICKET_PARTICIPANT',
      eventCategory: 'ticket_comments',
      subject: 'Ticket updated',
      htmlBody: '<p>Updated</p>',
    });

    expect(result.status).toBe('DIGEST_PENDING');
  });

  it('continues critical status emails after an optional-email unsubscribe', async () => {
    prisma.query
      .mockResolvedValueOnce([{ reason: 'UNSUBSCRIBED' }])
      .mockResolvedValueOnce([{
        id: 'pref-1',
        userId: 'user-1',
        emailEnabled: 0,
        digestDaily: 1,
        settings: JSON.stringify({ events: { ticket_status: false } }),
      }]);

    const result = await service.enqueue({
      userId: 'user-1',
      recipientEmail: 'user@example.com',
      eventType: 'TICKET_PARTICIPANT',
      eventCategory: 'ticket_status',
      subject: 'Ticket status changed',
      htmlBody: '<p>Status changed</p>',
    });

    expect(result.status).toBe('QUEUED');
  });

  it('marks a failed SMTP attempt for exponential retry', async () => {
    prisma.query.mockResolvedValueOnce([{
      id: 'delivery-1',
      recipientEmail: 'user@example.com',
      subject: 'Ticket updated',
      htmlBody: '<p>Updated</p>',
      textBody: 'Updated',
      metadata: '{}',
      attempts: 0,
    }]);
    emailService.sendNotificationEmail.mockRejectedValueOnce(new Error('SMTP unavailable'));

    await service.processQueue();

    expect(prisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'FAILED'"),
      expect.arrayContaining(['SMTP unavailable', 2, 'delivery-1']),
    );
  });
});
