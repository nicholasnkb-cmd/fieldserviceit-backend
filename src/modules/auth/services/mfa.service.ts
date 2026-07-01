import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../../database/database.service';
import { decryptSecret, encryptSecret } from '../../../common/security/encryption';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const POLICY_ID = 'global-security-policy';

@Injectable()
export class MfaService {
  constructor(private readonly db: DatabaseService) {}

  async status(userId: string) {
    const rows = await this.db.query<any[]>(
      `SELECT mfaEnabled, mfaEnabledAt, mfaRecoveryCodes
       FROM User WHERE id = ? LIMIT 1`,
      [userId],
    );
    if (!rows[0]) throw new UnauthorizedException();
    return {
      enabled: Boolean(rows[0].mfaEnabled),
      enabledAt: rows[0].mfaEnabledAt,
      recoveryCodesRemaining: this.parseRecoveryHashes(rows[0].mfaRecoveryCodes).length,
    };
  }

  async isRequired(role: string) {
    const rows = await this.db.query<any[]>(
      `SELECT requireMfaSuperAdmin, requireMfaTenantAdmin, requireMfaTechnicians
       FROM PlatformSecurityPolicy WHERE id = ? LIMIT 1`,
      [POLICY_ID],
    ).catch(() => []);
    const policy = rows[0] || {};
    if (role === 'SUPER_ADMIN') return Boolean(policy.requireMfaSuperAdmin);
    if (role === 'TENANT_ADMIN') return Boolean(policy.requireMfaTenantAdmin);
    return ['TECHNICIAN', 'GLOBAL_TECH'].includes(role) && Boolean(policy.requireMfaTechnicians);
  }

  async beginSetup(userId: string, email: string) {
    const secret = this.generateSecret();
    await this.db.execute(
      `UPDATE User SET mfaPendingSecretEncrypted = ?, updatedAt = NOW(3) WHERE id = ?`,
      [encryptSecret(secret), userId],
    );
    const label = encodeURIComponent(`FieldserviceIT:${email}`);
    const issuer = encodeURIComponent('FieldserviceIT');
    return {
      secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    };
  }

  async confirmSetup(userId: string, code: string) {
    const rows = await this.db.query<any[]>(
      `SELECT mfaPendingSecretEncrypted FROM User WHERE id = ? LIMIT 1`,
      [userId],
    );
    const encrypted = rows[0]?.mfaPendingSecretEncrypted;
    if (!encrypted) throw new BadRequestException('Start MFA setup before confirming it');
    const secret = decryptSecret(encrypted);
    if (!this.verifyTotp(secret, code)) throw new BadRequestException('The authenticator code is invalid');

    const recoveryCodes = Array.from({ length: 10 }, () => this.generateRecoveryCode());
    await this.db.execute(
      `UPDATE User
       SET mfaEnabled = 1, mfaSecretEncrypted = ?, mfaPendingSecretEncrypted = NULL,
           mfaRecoveryCodes = ?, mfaEnabledAt = NOW(3), updatedAt = NOW(3)
       WHERE id = ?`,
      [encryptSecret(secret), JSON.stringify(recoveryCodes.map((item) => this.hashRecoveryCode(item))), userId],
    );
    return { enabled: true, recoveryCodes };
  }

  async verifyUserCode(userId: string, code: string) {
    const rows = await this.db.query<any[]>(
      `SELECT mfaEnabled, mfaSecretEncrypted, mfaRecoveryCodes FROM User WHERE id = ? LIMIT 1`,
      [userId],
    );
    const user = rows[0];
    if (!user?.mfaEnabled || !user.mfaSecretEncrypted) throw new UnauthorizedException('MFA is not configured');
    const normalized = String(code || '').trim().toUpperCase();
    if (/^\d{6}$/.test(normalized) && this.verifyTotp(decryptSecret(user.mfaSecretEncrypted), normalized)) return true;

    const recoveryHashes = this.parseRecoveryHashes(user.mfaRecoveryCodes);
    const submittedHash = this.hashRecoveryCode(normalized);
    const matchedIndex = recoveryHashes.findIndex((item) => this.safeEqual(item, submittedHash));
    if (matchedIndex < 0) throw new UnauthorizedException('Invalid MFA code');
    recoveryHashes.splice(matchedIndex, 1);
    await this.db.execute(
      `UPDATE User SET mfaRecoveryCodes = ?, updatedAt = NOW(3) WHERE id = ?`,
      [JSON.stringify(recoveryHashes), userId],
    );
    return true;
  }

  async disable(userId: string, code: string) {
    await this.verifyUserCode(userId, code);
    await this.db.execute(
      `UPDATE User
       SET mfaEnabled = 0, mfaSecretEncrypted = NULL, mfaPendingSecretEncrypted = NULL,
           mfaRecoveryCodes = NULL, mfaEnabledAt = NULL, updatedAt = NOW(3)
       WHERE id = ?`,
      [userId],
    );
    return { enabled: false };
  }

  verifyTotp(secret: string, code: string, now = Date.now()) {
    const counter = Math.floor(now / 30_000);
    return [-1, 0, 1].some((offset) => this.safeEqual(this.hotp(secret, counter + offset), String(code || '').trim()));
  }

  private hotp(secret: string, counter: number) {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac('sha1', this.decodeBase32(secret)).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = (
      ((digest[offset] & 0x7f) << 24)
      | ((digest[offset + 1] & 0xff) << 16)
      | ((digest[offset + 2] & 0xff) << 8)
      | (digest[offset + 3] & 0xff)
    );
    return String(binary % 1_000_000).padStart(6, '0');
  }

  private generateSecret() {
    return this.encodeBase32(crypto.randomBytes(20));
  }

  private generateRecoveryCode() {
    const value = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${value.slice(0, 5)}-${value.slice(5)}`;
  }

  private hashRecoveryCode(value: string) {
    return crypto.createHash('sha256').update(String(value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase()).digest('hex');
  }

  private parseRecoveryHashes(value: any): string[] {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  private safeEqual(left: string, right: string) {
    const a = Buffer.from(String(left));
    const b = Buffer.from(String(right));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  private encodeBase32(value: Buffer) {
    let bits = '';
    for (const byte of value) bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let index = 0; index < bits.length; index += 5) {
      output += BASE32_ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2)];
    }
    return output;
  }

  private decodeBase32(value: string) {
    let bits = '';
    for (const char of value.replace(/=+$/g, '').toUpperCase()) {
      const index = BASE32_ALPHABET.indexOf(char);
      if (index >= 0) bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
    return Buffer.from(bytes);
  }
}
