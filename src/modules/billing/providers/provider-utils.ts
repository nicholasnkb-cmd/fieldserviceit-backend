import * as crypto from 'crypto';

export function asText(rawBody: string | Buffer) {
  return Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
}

export function parseJsonBody(rawBody: string | Buffer) {
  const text = asText(rawBody);
  return text ? JSON.parse(text) : {};
}

export function hmacSha256Hex(secret: string, payload: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left || '', 'utf8');
  const b = Buffer.from(right || '', 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function fromSeconds(value?: number | string | null) {
  const number = Number(value || 0);
  return number ? new Date(number * 1000) : null;
}

export function fromIso(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(json?.error?.message || json?.errors?.[0]?.detail || json?.message || `Request failed with ${response.status}`);
  }
  return json;
}
