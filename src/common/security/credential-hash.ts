import * as crypto from 'crypto';

const HASH_PREFIX = 'sha256:';

export function hashCredential(value: string): string {
  return `${HASH_PREFIX}${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

export function isHashedCredential(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

export function credentialLookupValues(value: string): string[] {
  const hashed = hashCredential(value);
  return hashed === value ? [value] : [hashed, value];
}

export function credentialMatches(candidate: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const expected = isHashedCredential(stored) ? hashCredential(candidate) : candidate;
  const actualBuffer = Buffer.from(stored);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
