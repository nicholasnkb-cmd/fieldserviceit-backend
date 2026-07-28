export function authCookie(response: { headers: Record<string, unknown> }): string {
  const values = response.headers['set-cookie'];
  const cookies = Array.isArray(values) ? values : values ? [String(values)] : [];
  const pairs = cookies.map((cookie) => String(cookie).split(';', 1)[0]);
  if (!pairs.some((cookie) => cookie.startsWith('fsit_access='))) {
    throw new Error('Authentication response did not set the access cookie');
  }
  return pairs.join('; ');
}

export function authCookieValue(
  response: { headers: Record<string, unknown> },
  name: 'fsit_access' | 'fsit_refresh',
): string {
  const values = response.headers['set-cookie'];
  const cookies = Array.isArray(values) ? values : values ? [String(values)] : [];
  const prefix = `${name}=`;
  const match = cookies.map((cookie) => String(cookie).split(';', 1)[0]).find((cookie) => cookie.startsWith(prefix));
  if (!match) throw new Error(`Authentication response did not set ${name}`);
  return decodeURIComponent(match.slice(prefix.length));
}
