# Design Document — Multi-Tenant SaaS Backend

## Architecture Overview

### Request Lifecycle

```
1. HTTP Request
2. express.json() + cookieParser()
3. requestLogger (pino-http, assigns req.id)
4. metricsMiddleware (Prometheus counter + histogram)
5. Router (generalRateLimiter → auth/orgs/invites routes)
   a. requireAuth — verify JWT, attach req.user, set userStorage (AsyncLocalStorage)
   b. requireOrg — read X-Org-Id, verify Membership, set tenantStorage (AsyncLocalStorage)
   c. requireMinRole — check role from tenantStorage
   d. Controller — parse input → call Service → format response
   e. Service — business logic via Prisma (with `withOrg` for RLS)
6. errorHandler — catch AppError (known status) or 500 (unknown)
7. HTTP Response
```

### Why Node.js + Express 5

Express 5 natively handles async errors in middleware (no `express-async-errors` shim needed). Combined with TypeScript strict mode and Zod runtime validation, this gives a type-safe, fail-fast runtime.

## Multi-Tenant Isolation Strategy

### Two-Layer Defense

| Layer | Mechanism | Scope | What it prevents |
|---|---|---|---|
| 1 — Application | Explicit `where: { orgId }` in every Prisma query | Service layer | Primary isolation; developer error if omitted |
| 2 — Database | PostgreSQL Row-Level Security (RLS) policies | Database | Defense-in-depth if Layer 1 is bypassed |

### Why Two Layers?

- **Layer 1** is the primary guard — intentional and explicit in code. Every tenant-scoped query must include `orgId`. Reviews catch omissions.
- **Layer 2** is defense-in-depth — a bug or oversight in the service layer won't leak data across tenants. RLS policies are set at the database level and cannot be bypassed by the application.

### RLS Implementation

```sql
-- Applied on: Membership, Project, Invite, AuditLog
CREATE POLICY tenant_isolation ON "Project"
  FOR ALL USING ("orgId" = current_setting('app.current_org_id', TRUE));
```

The RLS context (`app.current_org_id`) is set per-transaction using PostgreSQL's `set_config`:

```typescript
export async function withOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_org_id', $1, TRUE)`,
      orgId,
    );
    return fn();
  });
}
```

The third argument `TRUE` makes the setting transaction-scoped — it automatically cleans up after the transaction commits or rolls back. This is critical because Prisma uses a connection pool; a connection-scoped setting would leak across requests.

### Why Not Subdomain-Based Isolation?

Subdomain-based isolation (e.g., `tenant1.app.com`) is an alternative, but:
- Requires DNS configuration per tenant
- Complicates development (subdomain routing in localhost)
- Doesn't prevent the same class of bugs (missing filter in query)
- SSL certificate management per tenant

The `X-Org-Id` header approach is simpler and equally secure with the two-layer defense.

### Connection Pooling + RLS Challenge

Prisma 7 uses `@prisma/adapter-pg` wrapping a `pg.Pool`. With a connection pool:
- `SET SESSION` would bleed across requests on pooled connections
- `SET LOCAL` only affects the current transaction
- `set_config(..., TRUE)` is transaction-scoped

The `withOrg` helper wraps all tenant-scoped queries in `$transaction` + `set_config`, ensuring RLS context is set on the same connection as the query. This is the correct solution for pooled environments.

## Authentication Design

### Token Architecture

| Token | Format | Lifetime | Storage | Purpose |
|---|---|---|---|---|
| Access | JWT (HS256) | 15 minutes | Client (memory/cookie) | API authorization |
| Refresh | 64-byte random hex | 7 days | DB (SHA-256 hash) | Session continuity |

### Why Opaque Refresh Tokens?

JWT refresh tokens cannot be revoked (they're valid until expiry). Opaque tokens stored as hashes in the DB can be individually revoked (set `revokedAt`), enabling:
- Logout from current device
- Logout from all devices
- Token rotation with replay detection

### Refresh Token Rotation

On every `/refresh` call:
1. Hash the incoming refresh token and look it up
2. If not found → 401 (invalid)
3. If `revokedAt` is set → 401 (replay detected — user was phished)
4. Revoke the old session
5. Create a new session with a fresh refresh token
6. Return new access token + new refresh token cookie

This means a stolen refresh token is only valid until the legitimate user refreshes, at which point the thief's token is revoked (replay detection).

### Cookie Configuration

```http
Set-Cookie: refreshToken=<opaque>; Max-Age=604800; Path=/api/auth; HttpOnly; SameSite=Strict
```

- `HttpOnly` — prevents XSS from stealing the token
- `SameSite=Strict` — prevents CSRF
- `Path=/api/auth` — narrow scope, cookies only sent to auth endpoints
- `Secure` — added automatically in production (HTTPS only)

## RBAC Design

### Role Hierarchy

```
OWNER (inherit ALL) → ADMIN (inherit ALL) → MEMBER
```

| Permission | OWNER | ADMIN | MEMBER |
|---|---|---|---|
| Update org | ✅ | ✅ | ❌ |
| Delete org | ✅ | ❌ | ❌ |
| Create invites | ✅ | ✅ | ❌ |
| Remove members | ✅ | ❌ | ❌ |
| View members | ✅ | ✅ | ✅ |
| View org details | ✅ | ✅ | ✅ |
| View projects | ✅ | ✅ | ✅ |

### Implementation

Roles are checked via the `requireMinRole` middleware, which reads the role from `AsyncLocalStorage` (set by `requireOrg`). This avoids re-querying the database on every authorization check.

```typescript
// Usage
router.patch("/:orgId",
  requireAuth,
  requireOrg,
  requireMinRole("ADMIN"),  // OWNER or ADMIN
  orgController.updateOrg,
);
```

## Operational Features

### Rate Limiting

Sliding window algorithm using Redis sorted sets:
- **General**: 100 requests per 15 minutes per IP
- **Auth endpoints** (`/login`, `/signup`): 10 requests per 15 minutes per IP
- Window is evaluated per-request using `ZREMRANGEBYSCORE` + `ZCARD`

### Brute-Force Protection

Per-email lockout on login:
- 5 failed attempts → 15-minute block
- Successful login clears the counter
- Uses Redis `INCR` + `PEXPIRE` for atomicity

### Health Checks

- `GET /health` returns DB (Prisma `SELECT 1`) and Redis (`PING`) status
- Used by Cloud Run for instance health evaluation

### Monitoring

Prometheus metrics exposed at `GET /metrics`:
- Default Node.js metrics (CPU, memory, event loop lag)
- `http_requests_total` — counter with method/path/status labels
- `http_request_duration_ms` — histogram with buckets

## Data Model

### Schema (7 models)

```
User (id, email, name, passwordHash, deletedAt)
  └── Session (id, userId, refreshTokenHash, expiresAt, revokedAt)

Organization (id, name, slug, deletedAt)
  ├── Membership (userId, orgId, role)  — @@unique([userId, orgId])
  ├── Project (id, name, orgId, createdById)
  ├── Invite (id, orgId, email, tokenHash, role, expiresAt, revokedAt)
  └── AuditLog (id, orgId?, actorId?, action, model, modelId, data?)
```

### Design Decisions

- **UUIDs** for all primary keys — prevents enumeration attacks, safe for distributed systems
- **Soft-delete** (`deletedAt`) on user-org models — recoverable, auditable
- **Index on `orgId`** on every tenant-scoped table — RLS queries always filter by org
- **Composite unique** on `Membership(userId, orgId)` — no duplicate memberships
- **`@@index([email])`** on Invite — invite lookup by email

## Tradeoffs & Alternatives

| Decision | Why this approach | Alternatives considered |
|---|---|---|
| Prisma `$extends` for audit | Removed in Prisma 7 (`$use` deprecated), `$extends` is the supported middleware pattern | Database triggers (less portable, harder to version with schema) |
| AsyncLocalStorage for context | Request-scoped without thread-local hacks; avoids passing `req` through every service call | Express `res.locals` (type-unsafe), manual parameter passing (verbose) |
| Redis for rate limiting | Fast, atomic ops, TTL auto-cleanup | In-memory (lost on restart, doesn't scale to multi-instance) |
| pg.Pool + adapter-pg | Required by Prisma 7 for PostgreSQL; supports RLS via `$transaction` | Prisma `datasourceUrl` (deprecated in v7), native `pg` (lose ORM benefits) |
| ESM (NodeNext) | Future-proof, aligns with TypeScript and Node.js direction | CommonJS (legacy, no `await` at top level) |

## Scaling Considerations

### Read Scaling

- Cloud SQL read replicas for read-heavy workloads
- Prisma supports read replicas via `@prisma/extension-read-replicas`

### Write Scaling

- Vertical scaling (larger Cloud SQL tier) first
- Horizontal: application-level sharding by tenant (separate DB per org)
- CQRS pattern for high-write tenants

### Connection Pool

- `pg.Pool` manages connections efficiently
- Cloud Run's max instances + concurrency settings control pool size
- Pool `min`/`max` should be tuned based on Cloud SQL tier and expected concurrency

### Caching

- Redis currently used for rate limiting only
- Could add: per-tenant query caching (cache-Aside pattern), session cache, org metadata cache
- Cache invalidation via audit log (invalidate on mutation)

## Related Documents

- `README.md` — Quick start, API reference
- `SECURITY.md` — Threat model, attack vectors, mitigations
- `phase-*.md` — Per-phase design documents
