# Data Model — Multi-Tenant Schema

## Entity Relationship Overview

```
Company 1──N User
Company 1──N Ticket
Company 1──N Asset
Company 1──N Workflow
Company 1──N Contract

User 1──N Ticket (created)
User 1──N Ticket (assigned)
User 1──N Dispatch
User 1──N Notification

Ticket N──1 Asset
Ticket N──1 Contract
Ticket N──1 SLA
Ticket 1──N TimelineEntry
Ticket 1──N Dispatch

Asset N──1 AssetType
Asset 1──N Ticket
Asset 1──N Contract

Workflow 1──N WorkflowStep
Workflow 1──N WorkflowRun
WorkflowRun 1──N WorkflowRunStep
```

## Prisma Schema (see `backend/prisma/schema.prisma`)

### Core Tables

| Table | Description | Tenant Scope |
|-------|-------------|-------------|
| `companies` | Tenant organizations | Root (no companyId) |
| `users` | All platform users | companyId |
| `tickets` | ITSM tickets (incidents, requests, problems, changes) | companyId |
| `ticket_timeline` | Ticket activity log | companyId |
| `assets` | CMDB assets (computers, servers, printers, switches, IP phones, cloud) | companyId |
| `asset_types` | Asset categorization | Shared |
| `contracts` | Service contracts / agreements | companyId |
| `slas` | SLA definitions and targets | companyId |
| `workflows` | Workflow templates | companyId |
| `workflow_steps` | Individual workflow steps | companyId |
| `workflow_runs` | Workflow execution instances | companyId |
| `workflow_run_steps` | Per-step execution status | companyId |
| `dispatches` | Field technician dispatch records | companyId |
| `notifications` | User notifications | companyId |
| `notification_preferences` | Per-user notification settings | companyId |
| `audit_logs` | Immutable audit trail | companyId |
| `sessions` | Auth sessions / refresh tokens | companyId |

### Key Field Conventions

- **id:** UUID v4 primary key
- **companyId:** UUID foreign key (null for shared/system rows)
- **createdAt/updatedAt:** Auto-managed timestamps
- **deletedAt:** Nullable soft-delete timestamp
- **status:** Enum string field

### Ticket Status Enum

```
OPEN → ASSIGNED → IN_PROGRESS → PENDING → RESOLVED → CLOSED
  ↘ ESCALATED
```

### Asset Types Enum

```
COMPUTER, SERVER, PRINTER, SWITCH, IP_PHONE, CLOUD_INSTANCE, NETWORK_DEVICE, VIRTUAL_MACHINE, OTHER
```

### Priority Enum

```
LOW, MEDIUM, HIGH, CRITICAL
```

### User Roles (RBAC)

```
SUPER_ADMIN     # Platform-wide admin
TENANT_ADMIN    # Company admin
TECHNICIAN      # Field/service technician
CLIENT          # End user / requestor
READ_ONLY       # View-only access
```
