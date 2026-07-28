import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class PasskeyService {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService) {}

  async registrationOptions(user: { id: string; email: string }) {
    const credentials = await this.db.query<any[]>(
      `SELECT credentialId, transports FROM WebAuthnCredential WHERE userId = ? ORDER BY createdAt DESC`,
      [user.id],
    );
    const options = await generateRegistrationOptions({
      rpName: 'FieldserviceIT',
      rpID: this.rpId(),
      userID: Buffer.from(user.id, 'utf8'),
      userName: user.email,
      userDisplayName: user.email,
      attestationType: 'none',
      timeout: 60_000,
      excludeCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: this.parseJson(credential.transports),
      })),
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
    });
    const challengeId = await this.saveChallenge(user.id, 'REGISTER', options.challenge);
    return { options, challengeId };
  }

  async verifyRegistration(user: { id: string }, challengeId: string, response: RegistrationResponseJSON, name?: string) {
    const challenge = await this.getChallenge(challengeId, 'REGISTER', user.id);
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origins(),
      expectedRPID: this.rpId(),
      requireUserVerification: true,
    }).catch(() => null);
    if (!verification?.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey registration could not be verified');
    }
    await this.consumeChallenge(challengeId);
    const credential = verification.registrationInfo.credential;
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO WebAuthnCredential
       (id, userId, credentialId, publicKey, counter, transports, deviceType, backedUp, name, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        id,
        user.id,
        credential.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        JSON.stringify((response.response as any).transports || []),
        verification.registrationInfo.credentialDeviceType,
        verification.registrationInfo.credentialBackedUp ? 1 : 0,
        name?.trim() || 'Passkey',
      ],
    ).catch((error) => {
      if (String(error?.code || '').includes('DUP')) throw new BadRequestException('This passkey is already registered');
      throw error;
    });
    await this.audit(user.id, 'PASSKEY_REGISTERED', id, { backedUp: verification.registrationInfo.credentialBackedUp });
    return { verified: true, id };
  }

  async authenticationOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.rpId(),
      timeout: 60_000,
      userVerification: 'required',
    });
    const challengeId = await this.saveChallenge(null, 'AUTHENTICATE', options.challenge);
    return { options, challengeId };
  }

  async verifyAuthentication(challengeId: string, response: AuthenticationResponseJSON) {
    const challenge = await this.getChallenge(challengeId, 'AUTHENTICATE');
    const credentials = await this.db.query<any[]>(
      `SELECT credential.*, user.email, user.isActive
       FROM WebAuthnCredential credential
       JOIN User user ON user.id = credential.userId
       WHERE credential.credentialId = ? LIMIT 1`,
      [response.id],
    );
    const record = credentials[0];
    if (!record?.isActive) throw new UnauthorizedException('Passkey authentication failed');
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origins(),
      expectedRPID: this.rpId(),
      credential: {
        id: record.credentialId,
        publicKey: new Uint8Array(record.publicKey),
        counter: Number(record.counter || 0),
        transports: this.parseJson(record.transports),
      },
      requireUserVerification: true,
    }).catch(() => null);
    if (!verification?.verified) throw new UnauthorizedException('Passkey authentication failed');
    await this.consumeChallenge(challengeId);
    await this.db.execute(
      `UPDATE WebAuthnCredential SET counter = ?, lastUsedAt = NOW(3) WHERE id = ?`,
      [verification.authenticationInfo.newCounter, record.id],
    );
    await this.audit(record.userId, 'PASSKEY_AUTHENTICATED', record.id, {});
    return { userId: record.userId };
  }

  async list(userId: string) {
    return this.db.query(
      `SELECT id, name, deviceType, backedUp, createdAt, lastUsedAt
       FROM WebAuthnCredential WHERE userId = ? ORDER BY createdAt DESC`,
      [userId],
    );
  }

  async rename(userId: string, id: string, name: string) {
    const result = await this.db.execute(
      `UPDATE WebAuthnCredential SET name = ? WHERE id = ? AND userId = ?`,
      [name.trim(), id, userId],
    );
    if (!result.affectedRows) throw new BadRequestException('Passkey not found');
    await this.audit(userId, 'PASSKEY_RENAMED', id, {});
    return { updated: true };
  }

  async remove(userId: string, id: string) {
    const result = await this.db.execute(`DELETE FROM WebAuthnCredential WHERE id = ? AND userId = ?`, [id, userId]);
    if (!result.affectedRows) throw new BadRequestException('Passkey not found');
    await this.audit(userId, 'PASSKEY_REMOVED', id, {});
    return { removed: true };
  }

  private async saveChallenge(userId: string | null, purpose: string, challenge: string) {
    const id = randomUUID();
    await this.db.execute(
      `INSERT INTO WebAuthnChallenge (id, userId, purpose, challenge, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 5 MINUTE), NOW(3))`,
      [id, userId, purpose, challenge],
    );
    return id;
  }

  private async getChallenge(id: string, purpose: string, userId?: string) {
    const rows = await this.db.query<any[]>(
      `SELECT id, userId, challenge FROM WebAuthnChallenge
       WHERE id = ? AND purpose = ? AND usedAt IS NULL AND expiresAt > NOW(3)
       ${userId ? 'AND userId = ?' : ''} LIMIT 1`,
      userId ? [id, purpose, userId] : [id, purpose],
    );
    if (!rows[0]) throw new BadRequestException('Passkey challenge is invalid or expired');
    return rows[0];
  }

  private async consumeChallenge(id: string) {
    const result = await this.db.execute(
      `UPDATE WebAuthnChallenge SET usedAt = NOW(3) WHERE id = ? AND usedAt IS NULL AND expiresAt > NOW(3)`,
      [id],
    );
    if (!result.affectedRows) throw new BadRequestException('Passkey challenge has already been used');
  }

  private rpId() {
    const configured = this.config.get<string>('WEBAUTHN_RP_ID');
    if (configured) return configured;
    return new URL(this.config.get<string>('FRONTEND_URL', 'http://localhost:3000')).hostname;
  }

  private origins() {
    const configured = this.config.get<string>('WEBAUTHN_ORIGINS');
    return (configured || this.config.get<string>('FRONTEND_URL', 'http://localhost:3000'))
      .split(',').map((value) => value.trim()).filter(Boolean);
  }

  private parseJson(value: any) {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private audit(userId: string, action: string, resourceId: string, diff: Record<string, any>) {
    return this.db.execute(
      `INSERT INTO AuditLog (id, companyId, actorId, action, resourceType, resourceId, diff, createdAt)
       SELECT ?, companyId, id, ?, 'WebAuthnCredential', ?, ?, NOW(3) FROM User WHERE id = ?`,
      [randomUUID(), action, resourceId, JSON.stringify(diff), userId],
    );
  }
}
