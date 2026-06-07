import * as crypto from 'crypto';

function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update(process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fieldserviceit-dev-key')
    .digest();
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
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8');
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
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
