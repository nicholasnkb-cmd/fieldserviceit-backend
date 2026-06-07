import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
  getTestMessageUrl: jest.fn(),
}));

describe('EmailService', () => {
  const originalEnv = process.env;
  let prisma: any;
  let logger: any;
  let transporter: any;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      JWT_SECRET: 'email-service-test-key',
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASS: '',
    };
    prisma = {
      query: jest.fn().mockResolvedValue([]),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 }),
    };
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    transporter = {
      verify: jest.fn().mockResolvedValue(true),
      sendMail: jest.fn().mockResolvedValue({ messageId: 'message-1' }),
    };
    (nodemailer.createTransport as jest.Mock).mockReturnValue(transporter);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('verifies and encrypts a database-backed SMTP configuration', async () => {
    const service = new EmailService(logger, prisma);

    const status = await service.configure({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      username: 'support@example.com',
      password: 'not-plain-text',
      fromAddress: 'support@example.com',
      replyTo: 'help@example.com',
    }, 'admin-1');

    const values = prisma.execute.mock.calls[0][1];
    expect(transporter.verify).toHaveBeenCalled();
    expect(values[5]).toMatch(/^ENC:/);
    expect(values[5]).not.toContain('not-plain-text');
    expect(status).toMatchObject({
      configured: true,
      source: 'database',
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      passwordConfigured: true,
    });
    expect(status).not.toHaveProperty('password');
  });

  it('does not persist credentials when SMTP verification fails', async () => {
    transporter.verify.mockRejectedValueOnce(new Error('Authentication failed'));
    const service = new EmailService(logger, prisma);

    await expect(service.configure({
      host: 'smtp.example.com',
      port: 465,
      username: 'support@example.com',
      password: 'wrong-password',
      fromAddress: 'support@example.com',
    }, 'admin-1')).rejects.toThrow('SMTP connection failed');

    expect(prisma.execute).not.toHaveBeenCalled();
  });

  it('uses the stored provider for notification delivery', async () => {
    const service = new EmailService(logger, prisma);
    await service.configure({
      host: 'smtp.example.com',
      port: 465,
      username: 'support@example.com',
      password: 'stored-password',
      fromAddress: 'support@example.com',
    }, 'admin-1');

    await service.sendNotificationEmail('client@example.com', 'Ticket updated', '<p>Updated</p>');

    expect(transporter.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'support@example.com',
      to: 'client@example.com',
      subject: 'Ticket updated',
    }));
  });
});
