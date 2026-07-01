import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as dns from 'dns';
import * as net from 'net';
import { decryptSecret, encryptSecret } from '../../../common/security/encryption';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class OidcAuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async providers(email?: string) {
    const domain = String(email || '').trim().toLowerCase().split('@')[1] || '';
    const rows = await this.db.query<any[]>(
      `SELECT id, name, issuer, allowedDomains FROM OidcProviderConfig WHERE enabled = 1 ORDER BY name`,
    ).catch(() => []);
    return rows
      .filter((row) => {
        const allowed = this.parseDomains(row.allowedDomains);
        return domain ? allowed.length === 0 || allowed.includes(domain) : allowed.length === 0;
      })
      .map(({ id, name, issuer }) => ({ id, name, issuer }));
  }

  async start(providerId: string, redirectPath?: string) {
    const provider = await this.provider(providerId);
    const discovery = await this.discovery(provider.issuer);
    const state = this.randomToken(32);
    const nonce = this.randomToken(24);
    const codeVerifier = this.randomToken(48);
    const codeChallenge = this.base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
    const callbackUrl = this.callbackUrl(provider.id);
    await this.db.execute(
      `INSERT INTO OidcAuthState
       (id, providerId, stateHash, nonce, encryptedCodeVerifier, redirectPath, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 10 MINUTE), NOW(3))`,
      [
        crypto.randomUUID(), provider.id, this.hash(state), nonce, encryptSecret(codeVerifier),
        this.safeRedirectPath(redirectPath),
      ],
    );
    const authorizationUrl = new URL(discovery.authorization_endpoint);
    authorizationUrl.searchParams.set('client_id', provider.clientId);
    authorizationUrl.searchParams.set('redirect_uri', callbackUrl);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('scope', 'openid email profile');
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set('nonce', nonce);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    return { authorizationUrl: authorizationUrl.toString() };
  }

  async callback(providerId: string, code: string, state: string) {
    if (!code || !state) throw new BadRequestException('OIDC callback is incomplete');
    const states = await this.db.query<any[]>(
      `SELECT * FROM OidcAuthState
       WHERE providerId = ? AND stateHash = ? AND expiresAt > NOW(3)
       LIMIT 1`,
      [providerId, this.hash(state)],
    );
    const authState = states[0];
    if (!authState) throw new UnauthorizedException('OIDC state is invalid or expired');
    const provider = await this.provider(providerId);
    const discovery = await this.discovery(provider.issuer);
    const tokens = await this.exchangeCode(provider, discovery, code, decryptSecret(authState.encryptedCodeVerifier));
    if (!tokens.id_token) throw new UnauthorizedException('Identity provider did not return an ID token');
    const claims = await this.verifyIdToken(tokens.id_token, provider, discovery, authState.nonce);
    const user = await this.resolveUser(provider, claims);
    await this.assertRequiredMfa(user.role, claims);
    const loginCode = this.randomToken(32);
    await this.db.execute(
      `INSERT INTO OidcLoginCode (id, codeHash, userId, expiresAt, createdAt)
       VALUES (?, ?, ?, DATE_ADD(NOW(3), INTERVAL 2 MINUTE), NOW(3))`,
      [crypto.randomUUID(), this.hash(loginCode), user.id],
    );
    await this.db.execute(`DELETE FROM OidcAuthState WHERE id = ?`, [authState.id]);
    const frontend = String(this.config.get('FRONTEND_URL', 'http://localhost:3000')).replace(/\/+$/, '');
    const redirect = new URL(`${frontend}/sso/callback`);
    redirect.searchParams.set('code', loginCode);
    redirect.searchParams.set('returnTo', this.safeRedirectPath(authState.redirectPath) || '/dashboard');
    return redirect.toString();
  }

  async consumeLoginCode(code: string) {
    const codeHash = this.hash(String(code || ''));
    const rows = await this.db.query<any[]>(
      `SELECT l.id, l.userId, u.email, u.firstName, u.lastName, u.role, u.userType, u.companyId,
              u.emailVerified, u.isActive
       FROM OidcLoginCode l
       JOIN User u ON u.id = l.userId
       WHERE l.codeHash = ? AND l.usedAt IS NULL AND l.expiresAt > NOW(3)
       LIMIT 1`,
      [codeHash],
    );
    const login = rows[0];
    if (!login?.isActive) throw new UnauthorizedException('SSO login code is invalid or expired');
    const result = await this.db.execute(
      `UPDATE OidcLoginCode SET usedAt = NOW(3) WHERE id = ? AND usedAt IS NULL`,
      [login.id],
    );
    if (!result.affectedRows) throw new UnauthorizedException('SSO login code was already used');
    return login;
  }

  private async provider(id: string) {
    const rows = await this.db.query<any[]>(
      `SELECT * FROM OidcProviderConfig WHERE id = ? AND enabled = 1 LIMIT 1`,
      [id],
    );
    if (!rows[0]) throw new BadRequestException('SSO provider is not available');
    return rows[0];
  }

  private async exchangeCode(provider: any, discovery: any, code: string, codeVerifier: string) {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.callbackUrl(provider.id),
      client_id: provider.clientId,
      code_verifier: codeVerifier,
    });
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (provider.encryptedClientSecret) {
      const secret = decryptSecret(provider.encryptedClientSecret);
      if ((discovery.token_endpoint_auth_methods_supported || []).includes('client_secret_post')) {
        body.set('client_secret', secret);
      } else {
        headers.Authorization = `Basic ${Buffer.from(`${provider.clientId}:${secret}`).toString('base64')}`;
      }
    }
    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers,
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new UnauthorizedException(`OIDC token exchange failed: ${result.error || response.status}`);
    return result;
  }

  private async verifyIdToken(token: string, provider: any, discovery: any, nonce: string) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('ID token is invalid');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const allowedAlgorithms = new Map([
      ['RS256', { hash: 'sha256', ec: false }],
      ['RS384', { hash: 'sha384', ec: false }],
      ['RS512', { hash: 'sha512', ec: false }],
      ['ES256', { hash: 'sha256', ec: true }],
      ['ES384', { hash: 'sha384', ec: true }],
    ]);
    const algorithm = allowedAlgorithms.get(header.alg);
    if (!algorithm || !header.kid) throw new UnauthorizedException('ID token signing algorithm is not supported');
    const jwksResponse = await fetch(discovery.jwks_uri, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!jwksResponse.ok) throw new UnauthorizedException('Identity provider signing keys are unavailable');
    const jwks: any = await jwksResponse.json();
    const jwk = Array.isArray(jwks.keys)
      ? jwks.keys.find((item: any) => item.kid === header.kid && (!item.alg || item.alg === header.alg) && (!item.use || item.use === 'sig'))
      : null;
    if (!jwk) throw new UnauthorizedException('ID token signing key was not found');
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    const valid = crypto.verify(
      algorithm.hash,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      algorithm.ec ? { key: publicKey, dsaEncoding: 'ieee-p1363' } : publicKey,
      Buffer.from(parts[2], 'base64url'),
    );
    if (!valid) throw new UnauthorizedException('ID token signature is invalid');
    const issuer = String(claims.iss || '').replace(/\/+$/, '');
    if (issuer !== String(provider.issuer).replace(/\/+$/, '')) throw new UnauthorizedException('ID token issuer is invalid');
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(provider.clientId)) throw new UnauthorizedException('ID token audience is invalid');
    if (audience.length > 1 && claims.azp !== provider.clientId) throw new UnauthorizedException('ID token authorized party is invalid');
    if (!claims.exp || Number(claims.exp) * 1000 <= Date.now()) throw new UnauthorizedException('ID token is expired');
    if (claims.nonce !== nonce) throw new UnauthorizedException('ID token nonce is invalid');
    if (!claims.email || claims.email_verified === false) throw new UnauthorizedException('A verified email address is required');
    return claims;
  }

  private async resolveUser(provider: any, claims: any) {
    const email = String(claims.email).trim().toLowerCase();
    const domain = email.split('@')[1] || '';
    const allowedDomains = this.parseDomains(provider.allowedDomains);
    if (allowedDomains.length && !allowedDomains.includes(domain)) throw new UnauthorizedException('Email domain is not allowed for this provider');
    const existing = await this.db.query<any[]>(`SELECT * FROM User WHERE email = ? AND deletedAt IS NULL LIMIT 1`, [email]);
    if (existing[0]) {
      if (!existing[0].isActive) throw new UnauthorizedException('Account is inactive');
      if (provider.companyId && existing[0].companyId !== provider.companyId) throw new UnauthorizedException('Account belongs to another company');
      return existing[0];
    }
    if (!provider.autoProvision) throw new UnauthorizedException('No account exists for this email address');
    if (!provider.companyId) throw new UnauthorizedException('Automatic provisioning requires a company-scoped provider');
    const user = {
      id: crypto.randomUUID(),
      email,
      firstName: String(claims.given_name || claims.name || email.split('@')[0]).slice(0, 191),
      lastName: String(claims.family_name || 'User').slice(0, 191),
      role: String(provider.defaultRole || 'CLIENT').toUpperCase(),
      userType: 'BUSINESS',
      companyId: provider.companyId,
    };
    await this.db.execute(
      `INSERT INTO User
       (id, email, passwordHash, firstName, lastName, role, userType, companyId, isActive, emailVerified, createdAt, updatedAt)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, 1, NOW(3), NOW(3))`,
      [user.id, user.email, user.firstName, user.lastName, user.role, user.userType, user.companyId],
    );
    return user;
  }

  private async assertRequiredMfa(role: string, claims: any) {
    const rows = await this.db.query<any[]>(
      `SELECT requireMfaSuperAdmin, requireMfaTenantAdmin, requireMfaTechnicians, requirePhishingResistantSuperAdmin
       FROM PlatformSecurityPolicy WHERE id = 'global-security-policy' LIMIT 1`,
    ).catch(() => []);
    const policy = rows[0] || {};
    const required = role === 'SUPER_ADMIN'
      ? Boolean(policy.requireMfaSuperAdmin)
      : role === 'TENANT_ADMIN'
        ? Boolean(policy.requireMfaTenantAdmin)
        : ['TECHNICIAN', 'GLOBAL_TECH'].includes(role) && Boolean(policy.requireMfaTechnicians);
    if (!required) return;
    const methods = Array.isArray(claims.amr) ? claims.amr.map((item: any) => String(item).toLowerCase()) : [];
    if (role === 'SUPER_ADMIN' && Boolean(policy.requirePhishingResistantSuperAdmin)) {
      if (!methods.some((item: string) => ['fido', 'webauthn', 'hwk'].includes(item))) {
        throw new UnauthorizedException('Phishing-resistant MFA is required for super administrators');
      }
      return;
    }
    if (!methods.some((item: string) => ['mfa', 'otp', 'totp', 'fido', 'webauthn', 'hwk'].includes(item))) {
      throw new UnauthorizedException('The identity provider did not confirm multi-factor authentication');
    }
  }

  private async discovery(issuer: string) {
    const issuerUrl = new URL(issuer);
    if (issuerUrl.protocol !== 'https:' && !(this.config.get('NODE_ENV') !== 'production' && ['localhost', '127.0.0.1'].includes(issuerUrl.hostname))) {
      throw new BadRequestException('OIDC issuer must use HTTPS');
    }
    await this.assertPublicNetwork(issuerUrl);
    const response = await fetch(`${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new BadRequestException(`OIDC discovery returned HTTP ${response.status}`);
    const body: any = await response.json();
    for (const field of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri']) {
      if (!body[field]) throw new BadRequestException(`OIDC discovery is missing ${field}`);
    }
    if (String(body.issuer).replace(/\/+$/, '') !== issuer.replace(/\/+$/, '')) throw new BadRequestException('OIDC discovery issuer mismatch');
    await Promise.all([
      this.assertEndpoint(body.authorization_endpoint),
      this.assertEndpoint(body.token_endpoint),
      this.assertEndpoint(body.jwks_uri),
    ]);
    return body;
  }

  private async assertEndpoint(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException('OIDC discovery returned an invalid endpoint URL');
    }
    if (url.protocol !== 'https:' && !(this.config.get('NODE_ENV') !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new BadRequestException('OIDC endpoints must use HTTPS');
    }
    await this.assertPublicNetwork(url);
  }

  private async assertPublicNetwork(url: URL) {
    if (this.config.get('OIDC_ALLOW_PRIVATE_ISSUERS', 'false') === 'true') return;
    if (this.config.get('NODE_ENV') !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname)) return;
    const addresses = net.isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await dns.promises.lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((item) => this.isPrivateAddress(item.address))) {
      throw new BadRequestException('OIDC issuer resolves to a private or reserved address');
    }
  }

  private isPrivateAddress(address: string) {
    const normalized = address.toLowerCase();
    if (normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true;
    const ipv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1] || normalized;
    if (!net.isIPv4(ipv4)) return false;
    const [a, b] = ipv4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }

  private callbackUrl(providerId: string) {
    const apiUrl = String(this.config.get('API_URL', 'http://localhost:4000')).replace(/\/+$/, '');
    return `${apiUrl}/v1/auth/sso/${encodeURIComponent(providerId)}/callback`;
  }

  private parseDomains(value: any): string[] {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.map((item) => String(item).trim().toLowerCase()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  private safeRedirectPath(value?: string) {
    const path = String(value || '').trim();
    return path.startsWith('/') && !path.startsWith('//') ? path.slice(0, 500) : '';
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private randomToken(bytes: number) {
    return this.base64Url(crypto.randomBytes(bytes));
  }

  private base64Url(value: Buffer) {
    return value.toString('base64url');
  }
}
