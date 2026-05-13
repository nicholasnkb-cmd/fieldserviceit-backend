# FieldserviceIT

Multi-tenant enterprise workflow + IT operations platform (ITSM/MSP).

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, shadcn/ui, Zustand |
| Backend | Node.js 20, NestJS 10, REST |
| Database | MySQL 8.0 (Prisma ORM) |
| Auth | JWT, bcrypt |
| Real-time | Socket.IO (WebSocket) |
| Infra | Hostinger (shared/cloud hosting), Docker |

## Project Structure

```
FieldserviceIT/
├── docs/                        # Architecture & design docs
├── backend/                     # NestJS API server (port 4000)
│   ├── prisma/                  # Database schema & migrations
│   └── src/
│       ├── common/              # Guards, decorators, interceptors
│       ├── config/              # App configuration
│       ├── database/            # Prisma service
│       └── modules/             # Feature modules
│           ├── auth/            # Authentication & authorization
│           ├── users/           # User management
│           ├── companies/       # Tenant management
│           ├── tickets/         # ITSM ticketing (incidents, requests, problems, changes)
│           ├── cmdb/            # Asset/CMDB management
│           ├── field-service/   # Technician dispatch & mobile
│           ├── reporting/       # Analytics & BI reports
│           └── rmm-integration/ # RMM provider sync (ConnectWise, Datto, NinjaOne)
├── frontend/                    # Next.js application (port 3000)
│   └── src/
│       ├── app/                 # Pages (login, dashboard, admin)
│       ├── components/          # UI components
│       ├── lib/                 # API client, utilities
│       ├── stores/              # Zustand state management
│       └── types/               # TypeScript types
├── hostinger/                   # Deployment scripts & guides
├── infra/                       # Infrastructure configs
│   ├── docker-compose.yml       # Local development (MySQL, MailHog)
│   ├── kubernetes/              # K8s manifests (reference)
│   └── nginx.conf               # Reverse proxy config (reference)
└── .github/workflows/           # CI/CD pipelines
```

## Quick Start (Development)

### Prerequisites
- Node.js 20
- Docker (for MySQL)

### Backend

```bash
cd backend
npm install
copy .env.example .env          # Edit DATABASE_URL for your DB
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Using Docker (full stack)

```bash
docker compose -f infra/docker-compose.yml up -d
```

### Local Dev without Docker (SQLite)

```powershell
.\hostinger\test-local.ps1       # Builds SQLite DB, seeds, starts both servers, runs tests
.\hostinger\test-local.ps1 -Kill # Stop servers and clean up
```

## Deployment

Target: **Hostinger shared/cloud hosting** (Node.js 20 + MySQL 8.0).

See [hostinger/DEPLOY.md](hostinger/DEPLOY.md) for full instructions.

### Quick Build

```powershell
.\hostinger\build-all.ps1        # Builds both apps into hostinger/dist-*/
```

## Core Modules

- **ITSM** — Incident, request, problem, change management with SLAs
- **CMDB** — Asset tracking (computers, servers, printers, switches, IP phones, cloud)
- **Field Service** — Technician dispatch, GPS, signatures, photo uploads
- **RMM Integration** — ConnectWise, Datto, NinjaOne sync
- **Granular Permissions** — 25 permissions across 6 groups, 5 system roles
- **Multi-Tenant** — Row-level isolation via companyId

## Seed Accounts

| Email | Password | Role |
|-------|----------|------|
| super@fieldserviceit.com | admin123 | SUPER_ADMIN |
| admin@acme.com | admin123 | TENANT_ADMIN |
| client@acme.com | client123 | CLIENT |
| tech1@acme.com | tech123 | TECHNICIAN |
| tech2@acme.com | tech123 | TECHNICIAN |

## License

Proprietary — All rights reserved.
