# Security Architecture

## Authentication & Authorization

| Concern | Implementation |
|---------|---------------|
| Auth Protocol | JWT (access) + Refresh Token rotation |
| OAuth2 Providers | Google, Microsoft, GitHub SSO |
| MFA | TOTP (authenticator app) or SMS |
| Password Policy | min 12 chars, bcrypt cost 12, breach check |
| Session | Redis-backed, configurable TTL |
| API Rate Limiting | Token bucket (100 req/min per user) |

## RBAC Model

```
SUPER_ADMIN → TENANT_ADMIN → TECHNICIAN → CLIENT → READ_ONLY
```

- Roles are hierarchical (higher inherits lower permissions)
- Custom roles per tenant (future)
- Permission checks at controller guard level

## Data Protection

| Category | Measure |
|----------|---------|
| In Transit | TLS 1.3, HSTS, mTLS between services |
| At Rest | AES-256 (PostgreSQL TDE / RDS encryption) |
| PHI/HIPAA | Encrypted columns for sensitive fields |
| Secrets | Vault or AWS Secrets Manager (never in env files) |
| API Keys | Hashed on storage, shown once on creation |

## Tenant Isolation

1. **Row-level:** `WHERE companyId = :currentUser.companyId` enforced via Prisma middleware
2. **Guard-level:** `TenantGuard` NestJS interceptor validates ownership
3. **Token-level:** JWT contains `companyId` claim, verified on every request
4. **Storage-level:** S3 prefixes per tenant: `uploads/{companyId}/{uuid}`

## Audit Trail

All mutating operations recorded in `audit_logs`:

```json
{
  "id": "uuid",
  "companyId": "uuid",
  "actorId": "uuid",
  "action": "ticket.update",
  "resourceType": "ticket",
  "resourceId": "uuid",
  "diff": { "status": { "old": "OPEN", "new": "ASSIGNED" } },
  "ip": "203.0.113.1",
  "userAgent": "Mozilla/...",
  "timestamp": "2026-05-11T15:00:00Z"
}
```

Audit logs are **append-only** (no DELETE, no UPDATE). Immutable.

## Compliance Readiness

- **HIPAA:** BAA-ready, PHI field encryption, access logs, 6-year audit retention
- **SOC 2:** Access reviews, change management, incident response
- **GDPR:** Data export, right to erasure, consent tracking
