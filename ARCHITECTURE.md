# FieldserviceIT — Architecture Document

## Overview

Multi-tenant enterprise workflow + IT operations platform (MSP/ITSM). Built with a **Modular Monolith + Event-Driven Architecture** on NestJS.

## Architecture Diagram

```
                    ┌──────────────────────┐
                    │   Next.js UI         │
                    │ React / Tailwind     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   NestJS API          │
                    │ Auth / Guards / ACL   │
                    └──────────┬───────────┘
                               │
         ┌─────────────────────┼──────────────────────┐
         │                     │                      │
  ┌──────▼──────┐     ┌───────▼────────┐     ┌───────▼────────┐
  │ Ticketing   │     │ Asset / CMDB   │     │ User Management │
  │ Service     │     │ Service        │     │ Service         │
  └──────┬──────┘     └───────┬────────┘     └───────┬────────┘
         │                    │                      │
  ┌──────▼──────┐     ┌───────▼────────┐     ┌───────▼────────┐
  │ Field       │     │ Reporting / BI │     │ RMM Integration│
  │ Service     │     │ Analytics      │     │ (Sync Service) │
  └──────┬──────┘     └───────┬────────┘     └───────┬────────┘
         │                    │                      │
         └────────────┬───────┴──────────────┬───────┘
                      │                      │
             ┌────────▼────────┐    ┌────────▼────────┐
             │ MySQL 8.0       │    │ WebSocket        │
             │ Multi-tenant DB │    │ (Socket.IO)      │
             └─────────────────┘    └───────────────────┘
```

## Module Architecture (NestJS)

Each module follows NestJS convention:

```
module-name/
├── dto/                    # Data Transfer Objects
│   ├── create-.dto.ts
│   ├── update-.dto.ts
│   └── query-.dto.ts
├── controllers/            # Route handlers
│   └── .controller.ts
├── services/               # Business logic
│   └── .service.ts
├── events/                 # WebSocket event handlers
│   └── .gateway.ts
├── .module.ts              # Module definition
└── .spec.ts                # Tests
```

## Multi-Tenant Design

**Strategy:** Row-level tenant isolation via `companyId` column on all tenant-scoped tables.

```
┌────────────────────────────────────────────────┐
│                   MySQL 8.0                    │
│  ┌──────────────────────────────────────────┐  │
│  │  Global schema (shared)                  │  │
│  │  - companies                             │  │
│  │  - users (companyId nullable for public) │  │
│  │  - roles, permissions                    │  │
│  └──────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────┐  │
│  │  Tenant-scoped (companyId FK on every    │  │
│  │  table)                                  │  │
│  │  - tickets, assets, SLAs                 │  │
│  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

**Key principles:**
- All tenant queries include `WHERE companyId = :companyId`
- SUPER_ADMIN bypasses tenant isolation
- File uploads stored in tenant-prefixed paths

## Security Architecture

- **Auth:** JWT (access + refresh tokens), bcrypt password hashing
- **RBAC:** Database-driven roles & permissions (5 system roles, 25 permissions)
- **Audit Logs:** All mutating admin operations logged with actor, action, timestamp
- **Rate Limiting:** 10 requests/60s on login endpoint
- **CSP:** Content Security Policy via helmet
- **CORS:** Locked to configured origin

## Real-Time Events (WebSocket)

| Event | Direction | Description |
|-------|-----------|-------------|
| `ticket:created` | Server → Client | New ticket created |
| `ticket:updated` | Server → Client | Ticket status/assignee changed |
| `dispatch:created` | Server → Client | New dispatch assigned |
| `dispatch:updated` | Server → Client | Dispatch status changed |
| `dispatch:completed` | Server → Client | Dispatch completed |
| `presence:online` | Bidirectional | Online user tracking |

## Data Flow — Ticket Lifecycle

```
Client creates ticket
  → POST /v1/tickets (validated by class-validator)
  → AuthGuard (JWT) + PermissionsGuard
  → TicketsController.create()
  → TicketsService.createTicket()
  → Prisma insert to MySQL
  → WebSocket emits 'ticket:created'
```

## Storage

| Type | Config | Description |
|------|--------|-------------|
| Local | `STORAGE_TYPE=local` | Files saved to `./uploads/` |
| S3 | `STORAGE_TYPE=s3` | Files saved to S3-compatible storage |

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, shadcn/ui, Zustand, Recharts, Socket.IO Client |
| Backend | Node.js 20, NestJS 10, REST |
| Database | MySQL 8.0 |
| ORM | Prisma 5 |
| Auth | JWT, bcrypt, Passport |
| Real-time | Socket.IO (WebSocket) |
| Validation | class-validator, class-transformer |
| Storage | Local filesystem or S3-compatible |
| CI/CD | GitHub Actions |
| Hosting | Hostinger (shared/cloud) |
