import * as crypto from 'crypto';

export function credentialEncryptionKeys(): Buffer[] {
  const configured = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production' && !configured) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY is required in production');
  }

  const current = configured || process.env.JWT_SECRET || 'fieldserviceit-dev-key';
  const previous = process.env.CREDENTIAL_ENCRYPTION_KEY_PREVIOUS;
  return [...new Set([current, previous].filter(Boolean) as string[])]
    .map((key) => crypto.createHash('sha256').update(key).digest());
}

function encryptionKey() {
  return credentialEncryptionKeys()[0];
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64')).join('.');
}

export function decryptSecret(value: string): string {
  const [iv, tag, encrypted] = String(value || '').split('.');
  if (!iv || !tag || !encrypted) throw new Error('Encrypted value is invalid');
  for (const key of credentialEncryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
    } catch { /* try the previous key during rotation */ }
  }
  throw new Error('Encrypted value cannot be decrypted with the configured keys');
}

export function encryptBuffer(value: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([Buffer.from('FSITBACKUP1'), iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBuffer(value: Buffer): Buffer {
  const header = value.subarray(0, 11).toString('utf8');
  if (header !== 'FSITBACKUP1') throw new Error('Backup header is invalid');
  const iv = value.subarray(11, 23);
  const tag = value.subarray(23, 39);
  const encrypted = value.subarray(39);
  for (const key of credentialEncryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch { /* try the previous key during rotation */ }
  }
  throw new Error('Backup cannot be decrypted with the configured keys');
}
