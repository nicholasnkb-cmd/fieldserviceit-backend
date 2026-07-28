import { browserOriginProtection } from './browser-origin-protection.middleware';

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
}

describe('browser origin protection', () => {
  const middleware = browserOriginProtection({
    frontendUrl: 'https://fieldserviceit.com',
    corsOrigin: 'https://fieldserviceit.com',
    production: true,
  });

  it('allows a cookie-authenticated mutation from the configured browser origin', () => {
    const next = jest.fn();
    middleware({ method: 'POST', headers: { cookie: 'fsit_access=token', origin: 'https://fieldserviceit.com' } } as any, response(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects missing or foreign origins when authentication cookies are present', () => {
    for (const origin of [undefined, 'null', 'https://attacker.example']) {
      const res = response();
      const next = jest.fn();
      middleware({ method: 'DELETE', headers: { cookie: 'fsit_refresh=token', ...(origin ? { origin } : {}) } } as any, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it('does not interfere with safe requests, webhooks, or bearer-token API clients', () => {
    for (const req of [
      { method: 'GET', headers: { cookie: 'fsit_access=token' } },
      { method: 'POST', headers: {} },
      { method: 'PATCH', headers: { authorization: 'Bearer service-token' } },
    ]) {
      const next = jest.fn();
      middleware(req as any, response(), next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });
});
