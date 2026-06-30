import { BadRequestException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { LoggerService } from '../../../common/logger/logger.service';
import { PrismaService } from '../../../database/prisma.service';
import { credentialEncryptionKeys } from '../../../common/security/encryption';

export type NotificationEmailOptions = {
  text?: string;
  replyTo?: string;
  fromName?: string;
};

export type SmtpConfigurationInput = {
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  password?: string;
  fromAddress: string;
  replyTo?: string | null;
};

type StoredSmtpRow = {
  host: string;
  port: number;
  secure: number | boolean;
  username: string;
  encryptedPassword: string;
  fromAddress: string;
  replyTo?: string | null;
  lastTestStatus?: string | null;
  lastTestAt?: Date | string | null;
  lastTestError?: string | null;
  encryptedWebhookSecret?: string | null;
  webhookSecretUpdatedAt?: Date | string | null;
};

type SmtpRuntime = {
  transporter: nodemailer.Transporter;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromAddress: string;
  replyTo?: string | null;
  source: 'database' | 'environment';
  lastTestStatus?: string | null;
  lastTestAt?: Date | string | null;
  lastTestError?: string | null;
  webhookSecretConfigured?: boolean;
  webhookSecretUpdatedAt?: Date | string | null;
};

const CONFIG_ID = 'global-smtp';
const CONFIG_CACHE_MS = 60_000;

@Injectable()
export class EmailService {
  private environmentRuntime: SmtpRuntime | null = null;
  private databaseRuntime: SmtpRuntime | null = null;
  private databaseLoadedAt = 0;

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    this.environmentRuntime = this.createEnvironmentRuntime();
    if (!this.environmentRuntime) {
      this.logger.warn('[EmailService] SMTP environment variables are not configured; checking database configuration');
    }
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const runtime = await this.getRuntime();
    if (!runtime) {
      this.logger.log(`[EmailService] SMTP not configured, skipping password reset email to ${to}`);
      return;
    }
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    const info = await runtime.transporter.sendMail({
      from: runtime.fromAddress,
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
    const runtime = await this.getRuntime();
    if (!runtime) throw new Error('SMTP is not configured');

    const info = await runtime.transporter.sendMail({
      from: options.fromName
        ? `"${this.escapeHeader(options.fromName)}" <${runtime.fromAddress}>`
        : runtime.fromAddress,
      to,
      subject,
      html,
      text: options.text,
      replyTo: options.replyTo || runtime.replyTo || undefined,
    });
    return { messageId: info.messageId };
  }

  async configure(input: SmtpConfigurationInput, updatedById: string) {
    const config = this.normalizeConfiguration(input);
    const current = await this.getStoredRow();
    const password = String(input.password || '').trim() || this.decryptSecret(current?.encryptedPassword);
    if (!password) throw new BadRequestException('SMTP password is required');

    const candidate = this.createRuntime({ ...config, password, source: 'database' });
    try {
      await candidate.transporter.verify();
    } catch (error) {
      throw new BadRequestException(`SMTP connection failed: ${this.safeError(error)}`);
    }

    await this.prisma.execute(
      `INSERT INTO EmailProviderConfig (
         id, provider, host, port, secure, username, encryptedPassword, fromAddress, replyTo,
         isActive, lastTestStatus, lastTestAt, lastTestError, updatedById, createdAt, updatedAt
       ) VALUES (?, 'SMTP', ?, ?, ?, ?, ?, ?, ?, 1, 'PASS', NOW(3), NULL, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         host = VALUES(host), port = VALUES(port), secure = VALUES(secure),
         username = VALUES(username), encryptedPassword = VALUES(encryptedPassword),
         fromAddress = VALUES(fromAddress), replyTo = VALUES(replyTo), isActive = 1,
         lastTestStatus = 'PASS', lastTestAt = NOW(3), lastTestError = NULL,
         updatedById = VALUES(updatedById), updatedAt = NOW(3)`,
      [
        CONFIG_ID,
        config.host,
        config.port,
        config.secure ? 1 : 0,
        config.username,
        this.encryptSecret(password),
        config.fromAddress,
        config.replyTo || null,
        updatedById,
      ],
    );

    this.databaseRuntime = {
      ...candidate,
      lastTestStatus: 'PASS',
      lastTestAt: new Date(),
      lastTestError: null,
      webhookSecretConfigured: Boolean(current?.encryptedWebhookSecret),
      webhookSecretUpdatedAt: current?.webhookSecretUpdatedAt || null,
    };
    this.databaseLoadedAt = Date.now();
    return this.statusFromRuntime(this.databaseRuntime);
  }

  async testConfiguration() {
    const runtime = await this.getRuntime(true);
    if (!runtime) throw new BadRequestException('SMTP is not configured');

    try {
      await runtime.transporter.verify();
      runtime.lastTestStatus = 'PASS';
      runtime.lastTestAt = new Date();
      runtime.lastTestError = null;
      await this.updateTestStatus(runtime, 'PASS', null);
      return this.statusFromRuntime(runtime);
    } catch (error) {
      const message = this.safeError(error);
      runtime.lastTestStatus = 'FAIL';
      runtime.lastTestAt = new Date();
      runtime.lastTestError = message;
      await this.updateTestStatus(runtime, 'FAIL', message);
      throw new BadRequestException(`SMTP connection failed: ${message}`);
    }
  }

  async getStatus() {
    return this.statusFromRuntime(await this.getRuntime());
  }

  async rotateWebhookSecret(updatedById: string) {
    const row = await this.getStoredRow();
    if (!row) throw new BadRequestException('Configure SMTP before creating an email webhook secret');
    const secret = crypto.randomBytes(32).toString('base64url');
    await this.prisma.execute(
      `UPDATE EmailProviderConfig
       SET encryptedWebhookSecret = ?, webhookSecretUpdatedAt = NOW(3),
           updatedById = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      [this.encryptSecret(secret), updatedById, CONFIG_ID],
    );
    if (this.databaseRuntime) {
      this.databaseRuntime.webhookSecretConfigured = true;
      this.databaseRuntime.webhookSecretUpdatedAt = new Date();
    }
    return {
      secret,
      updatedAt: new Date(),
      inboundUrl: `${this.apiBaseUrl()}/v1/tickets/inbound-email`,
      eventUrl: `${this.apiBaseUrl()}/v1/notifications/email/events`,
    };
  }

  async isWebhookSecretValid(value?: string | null) {
    const supplied = String(value || '');
    if (!supplied) return false;
    const row = await this.getStoredRow();
    const stored = this.decryptSecret(row?.encryptedWebhookSecret);
    const fallback = process.env.EMAIL_WEBHOOK_API_KEY || process.env.INBOUND_EMAIL_API_KEY || '';
    const expected = stored || fallback;
    if (!expected) return false;
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    return suppliedBuffer.length === expectedBuffer.length
      && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
  }

  private async getRuntime(forceReload = false): Promise<SmtpRuntime | null> {
    const cacheExpired = Date.now() - this.databaseLoadedAt >= CONFIG_CACHE_MS;
    if (forceReload || !this.databaseLoadedAt || cacheExpired) {
      try {
        const row = await this.getStoredRow();
        this.databaseRuntime = row ? this.runtimeFromStoredRow(row) : null;
      } catch (error) {
        this.logger.warn(`[EmailService] Unable to load database SMTP configuration: ${this.safeError(error)}`);
        this.databaseRuntime = null;
      }
      this.databaseLoadedAt = Date.now();
    }
    return this.databaseRuntime || this.environmentRuntime;
  }

  private async getStoredRow(): Promise<StoredSmtpRow | null> {
    const rows = await this.prisma.query<StoredSmtpRow[]>(
      `SELECT host, port, secure, username, encryptedPassword, fromAddress, replyTo,
              lastTestStatus, lastTestAt, lastTestError,
              encryptedWebhookSecret, webhookSecretUpdatedAt
       FROM EmailProviderConfig
       WHERE id = ? AND isActive = 1
       LIMIT 1`,
      [CONFIG_ID],
    );
    return rows[0] || null;
  }

  private runtimeFromStoredRow(row: StoredSmtpRow): SmtpRuntime | null {
    const password = this.decryptSecret(row.encryptedPassword);
    if (!password) {
      this.logger.error('[EmailService] Stored SMTP password could not be decrypted');
      return null;
    }
    return {
      ...this.createRuntime({
        host: row.host,
        port: Number(row.port),
        secure: Boolean(row.secure),
        username: row.username,
        password,
        fromAddress: row.fromAddress,
        replyTo: row.replyTo,
        source: 'database',
      }),
      lastTestStatus: row.lastTestStatus,
      lastTestAt: row.lastTestAt,
      lastTestError: row.lastTestError,
      webhookSecretConfigured: Boolean(row.encryptedWebhookSecret),
      webhookSecretUpdatedAt: row.webhookSecretUpdatedAt,
    };
  }

  private createEnvironmentRuntime(): SmtpRuntime | null {
    const production = process.env.NODE_ENV === 'production';
    const host = process.env.SMTP_HOST?.trim() || (production ? '' : 'localhost');
    const port = Number.parseInt(process.env.SMTP_PORT || (production ? '587' : '1025'), 10);
    const username = process.env.SMTP_USER?.trim() || '';
    const password = process.env.SMTP_PASS || '';
    if (!host) return null;

    if (host === 'localhost' && port === 1025) {
      return {
        transporter: nodemailer.createTransport({ host, port, ignoreTLS: true }),
        host,
        port,
        secure: false,
        username: '',
        fromAddress: process.env.SMTP_FROM || 'noreply@fieldserviceit.com',
        replyTo: process.env.SMTP_REPLY_TO || null,
        source: 'environment',
      };
    }
    if (!username || !password) return null;
    return this.createRuntime({
      host,
      port,
      secure: port === 465,
      username,
      password,
      fromAddress: process.env.SMTP_FROM || username,
      replyTo: process.env.SMTP_REPLY_TO || null,
      source: 'environment',
    });
  }

  private createRuntime(config: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromAddress: string;
    replyTo?: string | null;
    source: 'database' | 'environment';
  }): SmtpRuntime {
    return {
      transporter: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.username, pass: config.password },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      }),
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      fromAddress: config.fromAddress,
      replyTo: config.replyTo,
      source: config.source,
    };
  }

  private normalizeConfiguration(input: SmtpConfigurationInput) {
    const host = String(input.host || '').trim();
    const port = Number(input.port);
    const username = String(input.username || '').trim();
    const fromAddress = String(input.fromAddress || '').trim();
    const replyTo = String(input.replyTo || '').trim() || null;
    if (!host || host.length > 255) throw new BadRequestException('A valid SMTP host is required');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new BadRequestException('SMTP port must be between 1 and 65535');
    if (!this.isEmail(username)) throw new BadRequestException('A valid SMTP username is required');
    if (!this.isEmail(fromAddress)) throw new BadRequestException('A valid from address is required');
    if (replyTo && !this.isEmail(replyTo)) throw new BadRequestException('Reply-to must be a valid email address');
    return {
      host,
      port,
      secure: input.secure === undefined ? port === 465 : Boolean(input.secure),
      username,
      fromAddress,
      replyTo,
    };
  }

  private statusFromRuntime(runtime: SmtpRuntime | null) {
    return {
      configured: Boolean(runtime),
      source: runtime?.source || null,
      host: runtime?.host || null,
      port: runtime?.port || null,
      secure: runtime?.secure ?? null,
      username: runtime?.username || null,
      passwordConfigured: Boolean(runtime),
      from: runtime?.fromAddress || 'noreply@fieldserviceit.com',
      replyTo: runtime?.replyTo || null,
      lastTestStatus: runtime?.lastTestStatus || null,
      lastTestAt: runtime?.lastTestAt || null,
      lastTestError: runtime?.lastTestError || null,
      webhookSecretConfigured: runtime?.webhookSecretConfigured || false,
      webhookSecretUpdatedAt: runtime?.webhookSecretUpdatedAt || null,
      inboundUrl: `${this.apiBaseUrl()}/v1/tickets/inbound-email`,
      eventUrl: `${this.apiBaseUrl()}/v1/notifications/email/events`,
    };
  }

  private async updateTestStatus(runtime: SmtpRuntime, status: 'PASS' | 'FAIL', error: string | null) {
    if (runtime.source !== 'database') return;
    await this.prisma.execute(
      `UPDATE EmailProviderConfig
       SET lastTestStatus = ?, lastTestAt = NOW(3), lastTestError = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      [status, error, CONFIG_ID],
    );
  }

  private encryptionKey() {
    return credentialEncryptionKeys()[0];
  }

  private encryptSecret(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `ENC:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptSecret(value?: string | null) {
    if (!value) return '';
    if (!value.startsWith('ENC:')) return value;
    for (const key of credentialEncryptionKeys()) try {
      const [, iv, tag, encrypted] = value.split(':');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
    } catch { /* try the previous key during rotation */ }
    return '';
  }

  private isEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private safeError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/[\r\n]+/g, ' ').slice(0, 500);
  }

  private escapeHeader(value: string) {
    return value.replace(/[\r\n"]/g, '').trim();
  }

  private apiBaseUrl() {
    return (process.env.API_URL || (process.env.NODE_ENV === 'production'
      ? 'https://api.fieldserviceit.com'
      : 'http://localhost:4000')).replace(/\/+$/, '');
  }
}
