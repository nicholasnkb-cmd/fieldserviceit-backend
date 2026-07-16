import type { Request, Response } from 'express';

const ACCESS_COOKIE = 'fsit_access';
const REFRESH_COOKIE = 'fsit_refresh';

function cookieOptions(req?: Request) {
  const secure = process.env.NODE_ENV === 'production' || req?.secure || req?.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function readAccessCookie(req: Request): string | null {
  return readCookie(req, ACCESS_COOKIE);
}

export function readRefreshCookie(req: Request): string | null {
  return readCookie(req, REFRESH_COOKIE);
}

export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }, req?: Request) {
  const options = cookieOptions(req);
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...options, maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...options, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

export function clearAuthCookies(res: Response, req?: Request) {
  const options = cookieOptions(req);
  res.clearCookie(ACCESS_COOKIE, options);
  res.clearCookie(REFRESH_COOKIE, options);
}

export function stripTokens<T extends Record<string, any>>(body: T) {
  const { accessToken: _accessToken, refreshToken: _refreshToken, ...rest } = body;
  return rest;
}
