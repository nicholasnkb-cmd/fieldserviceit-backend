# API Design — API-First Contract

## Base URL

```
https://api.fieldserviceit.com/v1
https://api.fieldserviceit.com/graphql
```

## Authentication

All requests require `Authorization: Bearer <jwt_token>` header.

### Endpoints

```
POST   /auth/login              # Email + password → JWT
POST   /auth/refresh            # Refresh token → new JWT
POST   /auth/logout             # Invalidate session
POST   /auth/mfa/setup          # Enable MFA
POST   /auth/mfa/verify         # Verify MFA code
POST   /auth/password/reset     # Request password reset
POST   /auth/password/change    # Set new password
```

## REST API Reference

### Tickets

```
GET    /tickets                     # List tickets (paginated, filtered)
POST   /tickets                     # Create ticket
GET    /tickets/:id                 # Get ticket detail
PATCH  /tickets/:id                 # Update ticket
DELETE /tickets/:id                 # Soft-delete ticket
POST   /tickets/:id/assign          # Assign technician
POST   /tickets/:id/escalate        # Escalate ticket
POST   /tickets/:id/resolve         # Resolve with resolution notes
GET    /tickets/:id/timeline        # Get ticket activity timeline
```

### CMDB (Assets)

```
GET    /assets                      # List assets
POST   /assets                      # Create asset
GET    /assets/:id                  # Get asset detail
PATCH  /assets/:id                  # Update asset
DELETE /assets/:id                  # Soft-delete asset
GET    /assets/:id/history          # Asset change history
POST   /assets/:id/relate           # Link asset to ticket/contract
```

### Users

```
GET    /users                       # List users (tenant-scoped)
POST   /users                       # Invite user
GET    /users/:id                   # Get user profile
PATCH  /users/:id                   # Update user
DELETE /users/:id                   # Deactivate user
GET    /users/:id/permissions       # Get user permissions
```

### Companies (Tenants)

```
GET    /companies                   # List companies (admin only)
POST   /companies                   # Onboard new tenant
GET    /companies/:id               # Get company detail
PATCH  /companies/:id               # Update company settings
DELETE /companies/:id               # Deactivate tenant
GET    /companies/:id/stats         # Tenant usage stats
```

### Workflows

```
GET    /workflows                   # List workflow templates
POST   /workflows                   # Create workflow definition
GET    /workflows/:id               # Get workflow template
PATCH  /workflows/:id               # Update workflow
DELETE /workflows/:id               # Delete workflow
POST   /workflows/:id/execute       # Execute workflow for ticket
GET    /workflows/:id/runs          # List workflow execution history
```

### Field Service

```
GET    /dispatch                    # Get dispatch board
POST   /dispatch                    # Dispatch technician to ticket
PATCH  /dispatch/:id                # Update dispatch status
POST   /dispatch/:id/checkin        # Technician check-in at site
POST   /dispatch/:id/checkout       # Technician checkout
POST   /dispatch/:id/notes          # Add onsite notes
POST   /dispatch/:id/signature      # Upload customer signature
POST   /dispatch/:id/photos         # Upload site photos
```

### Notifications

```
GET    /notifications               # List user notifications
PATCH  /notifications/:id/read      # Mark as read
POST   /notifications/read-all      # Mark all as read
GET    /notifications/preferences   # Get notification preferences
PATCH  /notifications/preferences   # Update preferences
```

### Reporting

```
GET    /reports/tickets              # Ticket summary report
GET    /reports/sla                  # SLA compliance report
GET    /reports/technician           # Technician performance
GET    /reports/assets               # Asset inventory report
GET    /reports/trends               # Trend analysis
```

## GraphQL Schema (Supplementary)

Use GraphQL for complex queries and real-time subscriptions:

```graphql
type Ticket {
  id: ID!
  title: String!
  description: String
  status: TicketStatus!
  priority: Priority!
  companyId: ID!
  assignedTo: User
  createdBy: User
  asset: Asset
  sla: SLA
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Query {
  tickets(
    companyId: ID
    status: TicketStatus
    assignedTo: ID
    search: String
    page: Int
    limit: Int
  ): PaginatedTickets!
  ticket(id: ID!): Ticket
}

type Mutation {
  createTicket(input: CreateTicketInput!): Ticket!
  updateTicket(id: ID!, input: UpdateTicketInput!): Ticket!
  assignTicket(id: ID!, userId: ID!): Ticket!
}

type Subscription {
  ticketUpdated(companyId: ID!): Ticket
  notificationReceived(userId: ID!): Notification
}
```

## Common Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number (default: 1) |
| `limit` | int | Items per page (default: 25, max: 100) |
| `sort` | string | Field to sort by |
| `order` | asc/dsc | Sort direction |
| `search` | string | Full-text search |
| `companyId` | UUID | Tenant filter |
| `status` | enum | Status filter |
| `from` | ISO date | Start date range |
| `to` | ISO date | End date range |

## Standard Response Envelope

```json
{
  "data": {},
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 142,
    "totalPages": 6
  },
  "error": null
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing/invalid JWT |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 422 | Invalid input |
| `TENANT_MISMATCH` | 403 | Cross-tenant access denied |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
