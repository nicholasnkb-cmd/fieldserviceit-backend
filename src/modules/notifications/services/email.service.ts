import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
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
      console.log(`[EmailService] SMTP not configured, skipping password reset email to ${to}`);
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
      if (previewUrl) console.log('Preview URL:', previewUrl);
    }
  }

  async sendNotificationEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      console.log(`[EmailService] SMTP not configured, skipping email to ${to}: ${subject}`);
      return;
    }
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@fieldserviceit.com',
      to,
      subject,
      html,
    });
  }
}
