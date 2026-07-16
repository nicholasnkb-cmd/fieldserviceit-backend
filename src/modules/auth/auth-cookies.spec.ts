import { clearAuthCookies, setAuthCookies } from './auth-cookies';

describe('auth cookies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sets host-only cookies outside production', () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_URL = 'https://fieldserviceit.com';
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };

    setAuthCookies(res as any, { accessToken: 'access', refreshToken: 'refresh' });

    expect(res.cookie).toHaveBeenCalledWith('fsit_access', 'access', expect.not.objectContaining({ domain: expect.any(String) }));
    expect(res.cookie).toHaveBeenCalledWith('fsit_refresh', 'refresh', expect.not.objectContaining({ domain: expect.any(String) }));
  });

  it('shares production cookies across the apex and api subdomain', () => {
    process.env.NODE_ENV = 'production';
    process.env.FRONTEND_URL = 'https://fieldserviceit.com';
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };

    setAuthCookies(res as any, { accessToken: 'access', refreshToken: 'refresh' }, { headers: { 'x-forwarded-proto': 'https' } } as any);

    expect(res.cookie).toHaveBeenCalledWith('fsit_access', 'access', expect.objectContaining({
      domain: '.fieldserviceit.com',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true,
    }));
    expect(res.cookie).toHaveBeenCalledWith('fsit_refresh', 'refresh', expect.objectContaining({
      domain: '.fieldserviceit.com',
    }));
  });

  it('uses an explicit cookie domain override for clearing too', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_COOKIE_DOMAIN = '.example.com';
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };

    clearAuthCookies(res as any);

    expect(res.clearCookie).toHaveBeenCalledWith('fsit_access', expect.objectContaining({ domain: '.example.com' }));
    expect(res.clearCookie).toHaveBeenCalledWith('fsit_refresh', expect.objectContaining({ domain: '.example.com' }));
  });
});
