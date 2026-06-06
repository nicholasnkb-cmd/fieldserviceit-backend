import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { LoggerService } from '../../../common/logger/logger.service';

export type NotificationEmailOptions = {
  text?: string;
  replyTo?: string;
  fromName?: string;
};

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly logger: LoggerService) {
    const host = process.env.SMTP_HOST || 'localhost';
    const port = parseInt(process.env.SMTP_PORT || '1025', 10);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';

    if (host === 'localhost' && port === 1025) {
      this.transporter = nodemailer.createTransport({ host, port, ignoreTLS: true });
    } else if (user && pass) {
      this.transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
    } else if (host.includes('ethereal')) {
      nodemailer.createTestAccount().then((account) => {
        this.transporter = nodemailer.createTransport({
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.secure,
          auth: { user: account.user, pass: account.pass },
        });
      });
    }
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[EmailService] SMTP not configured, skipping password reset email to ${to}`);
      return;
    }
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    const info = await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@fieldserviceit.com',
      to,
      subject: 'Password Reset - FieldserviceIT',
      html: `
        <h2>Password Reset</h2>
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    });

    if (process.env.NODE_ENV !== 'production') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) this.logger.log('Preview URL: ' + previewUrl);
    }
  }

  async sendNotificationEmail(
    to: string,
    subject: string,
    html: string,
    options: NotificationEmailOptions = {},
  ): Promise<{ messageId?: string }> {
    if (!this.transporter) {
      throw new Error('SMTP is not configured');
    }
    const fromAddress = process.env.SMTP_FROM || 'noreply@fieldserviceit.com';
    const info = await this.transporter.sendMail({
      from: options.fromName ? `"${this.escapeHeader(options.fromName)}" <${fromAddress}>` : fromAddress,
      to,
      subject,
      html,
      text: options.text,
      replyTo: options.replyTo || process.env.SMTP_REPLY_TO || undefined,
    });
    return { messageId: info.messageId };
  }

  getStatus() {
    return {
      configured: !!this.transporter,
      host: process.env.SMTP_HOST || null,
      port: Number(process.env.SMTP_PORT || 0) || null,
      from: process.env.SMTP_FROM || 'noreply@fieldserviceit.com',
      replyTo: process.env.SMTP_REPLY_TO || null,
    };
  }

  private escapeHeader(value: string) {
    return value.replace(/[\r\n"]/g, '').trim();
  }
}
