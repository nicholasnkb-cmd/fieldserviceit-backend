# Infrastructure — Cloud-Native Deployment

## Architecture

```
Cloudflare CDN/WAF
       │
  Load Balancer (AWS ALB / Nginx Ingress)
       │
  Kubernetes Cluster (EKS / AKS / GKE)
       │
  ┌────┴────┐          ┌───────────┐
  │ Backend │  ───→    │ PostgreSQL │
  │ Pods    │  ───→    │ (RDS/Cloud SQL)│
  └─────────┘          └───────────┘
       │
  ┌────┴────┐          ┌───────────┐
  │ Frontend│  ───→    │ Redis     │
  │ Pods    │          │ (ElastiCache)│
  └─────────┘          └───────────┘
       │
  ┌────┴────┐
  │ File    │
  │ Storage │ (S3 / GCS — photos, signatures, attachments)
  └─────────┘
```

## Docker Compose (Development)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: fieldserviceit
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://app:${DB_PASSWORD}@postgres:5432/fieldserviceit
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "4000:4000"
    depends_on:
      - postgres
      - redis

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
    ports:
      - "3000:3000"
```

## Kubernetes Manifests (see `infra/kubernetes/`)

Includes:
- `namespace.yaml` — Isolation per environment
- `backend-deployment.yaml` — NestJS app pods
- `frontend-deployment.yaml` — Next.js app pods
- `configmap.yaml` — App configuration
- `secrets.yaml` — Encrypted secrets (SOPS)
- `ingress.yaml` — Nginx Ingress + TLS
- `hpa.yaml` — Horizontal Pod Autoscaler
- `pdb.yaml` — Pod Disruption Budget
- `network-policy.yaml` — Pod network isolation

## CI/CD Pipeline (GitHub Actions)

See `.github/workflows/`

- **PR Check:** lint → typecheck → test → build
- **Staging Deploy:** On merge to `develop` — deploy to staging cluster
- **Production Deploy:** On tag/release — deploy to prod cluster (canary)

## Terraform (Infrastructure as Code)

See `infra/terraform/`

Manages:
- VPC / networking
- EKS cluster (or AKS/GKE)
- RDS PostgreSQL instance
- ElastiCache Redis cluster
- S3 bucket for file storage
- Cloudflare DNS / WAF
- IAM roles / service accounts

## Monitoring & Observability

- **Logs:** Loki + Promtail (structured JSON logging)
- **Metrics:** Prometheus + Grafana dashboards
- **Traces:** OpenTelemetry (Tempo/Jaeger)
- **Alerts:** AlertManager (PagerDuty / Slack)

## Backup & Disaster Recovery

- PostgreSQL: Daily snapshots (RDS automated) + WAL archiving (PITR)
- Redis: AOF persistence + periodic RDB snapshots
- Files: S3 versioning + cross-region replication
- DR: Multi-region standby cluster (1-hour RPO, 4-hour RTO)
