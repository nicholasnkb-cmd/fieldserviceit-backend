import type { NextFunction, Request, Response } from 'express';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH_COOKIES = ['fsit_access=', 'fsit_refresh='];

function origins(values: Array<string | undefined>): Set<string> {
  const result = new Set<string>();
  for (const raw of values) {
    for (const candidate of String(raw || '').split(',')) {
      try {
        result.add(new URL(candidate.trim()).origin);
      } catch {
        // Invalid deployment configuration is handled by the application's config validation.
      }
    }
  }
  return result;
}

export function browserOriginProtection(options: { frontendUrl?: string; corsOrigin?: string; production?: boolean }) {
  const allowed = origins([
    options.frontendUrl,
    options.corsOrigin,
    ...(options.production ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000']),
  ]);

  return (req: Request, res: Response, next: NextFunction) => {
    if (!UNSAFE_METHODS.has(String(req.method || '').toUpperCase())) return next();
    const cookie = String(req.headers.cookie || '');
    if (!AUTH_COOKIES.some((name) => cookie.includes(name))) return next();

    const origin = String(req.headers.origin || '');
    let normalized = '';
    try {
      normalized = new URL(origin).origin;
    } catch {
      normalized = '';
    }
    if (normalized && allowed.has(normalized)) return next();

    res.status(403).json({
      statusCode: 403,
      message: 'Browser origin verification failed',
      error: 'Forbidden',
    });
  };
}
