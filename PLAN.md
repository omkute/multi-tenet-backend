# Multi-Tenant SaaS Backend — Master Plan

## Project

Production-grade multi-tenant backend demonstrating tenant isolation (PostgreSQL RLS), RBAC, JWT auth, invite-based onboarding, audit logging, and operational maturity. Deployed on GCP (Cloud Run + Cloud SQL + Memorystore).

## Architecture

```
Client → Express API → requireAuth (JWT) → requireOrg (X-Org-Id) → Service → Prisma → PostgreSQL (RLS)
```

## Tech Stack (current versions)

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript 6, Express 5 |
| DB | PostgreSQL 16 via Prisma 7 (`@prisma/adapter-pg` driver adapter) |
| Auth | bcryptjs, JWT (HS256, 15m access + opaque refresh tokens stored hashed) |
| Cache | Redis 7 (docker-compose only, not used in app yet) |
| Logging | Pino 10 + pino-http 11 |
| Validation | Zod 4 |
| Testing | Jest + Supertest + Testcontainers |
| Deployment | Docker → GCP (Cloud Run + Cloud SQL + Memorystore) |
| CI | GitHub Actions |

---

# DONE: Phases 1–4

---

## Phase 1 — Project Foundation

### What was built

- TypeScript config (strict, `NodeNext` module, `@/` path alias)
- ESLint (8.x, typescript-eslint) + Prettier (3.x)
- Husky pre-commit hook → lint-staged (auto-fix staged `.ts`)
- Pino logger (`src/lib/logger.ts`) + request logging middleware (`request-logger.middleware.ts`)
- Zod env validation (`src/config/env.ts`) — fail-fast on startup
- Centralized error handler (`error.middleware.ts`) — handles `AppError` class, logs 500s
- Graceful shutdown (SIGTERM/SIGINT → close HTTP → 10s forced timeout)
- Dockerfile (multi-stage) + docker-compose.yml (Postgres 16 + Redis 7 with healthchecks)
- `.github/CODEOWNERS` + `.github/dependabot.yml`
- `AGENTS.md` — persistent context for AI sessions

### Key files

| File | Purpose |
|---|---|
| `src/config/env.ts` | Zod schema: `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_*_SECRET` |
| `src/lib/logger.ts` | Pino instance, pretty-print in dev, raw JSON in prod |
| `src/middleware/request-logger.middleware.ts` | Auto-log every request with ID, method, URL, response time |
| `src/middleware/error.middleware.ts` | `AppError` handler (status code) vs fallback 500 + structured log |
| `src/server.ts` | Listen + graceful shutdown |
| `src/app.ts` | Express app assembly |
| `phase-1.md` | Design doc |

---

## Phase 2 — Database Design

### Schema (7 models)

| Model | Key fields | RLS? | Notes |
|---|---|---|---|
| `User` | id, email (unique), passwordHash, name | No | Global table |
| `Organization` | id, name, slug (unique) | No | Root table |
| `Membership` | userId, orgId, role (OWNER/ADMIN/MEMBER) | Yes | `@@unique([userId, orgId])` |
| `Project` | name, orgId, createdById | Yes | Tenant-scoped |
| `Invite` | orgId, email, tokenHash, role, expiresAt | Yes | Token hashed in DB |
| `Session` | userId, refreshTokenHash (unique), expiresAt, revokedAt | No | User-scoped |
| `AuditLog` | orgId?, actorId?, action, model, modelId, data (JSON) | Yes when orgId set | Nullable actor/org |

### Key decisions

- **UUIDs** (not auto-increment) for all PKs — prevents enumeration, safe across services
- **Soft delete** (`deletedAt: DateTime?`) on all user/org data — recoverable, auditable
- `@@index([orgId])` on every tenant table — RLS query performance
- `@@unique([userId, orgId])` on Membership — no duplicate memberships

### Seed data

3 users (owner/admin/member), 1 org "Acme Corp", 3 memberships (OWNER/ADMIN/MEMBER roles), 1 project.

### Key files

| File | Purpose |
|---|---|
| `prisma/schema.prisma` | All 7 models, Role enum, indexes, relations |
| `prisma.config.ts` | Prisma v7 config: schema, migrations path, seed command |
| `prisma/seed.ts` | `tsx prisma/seed.ts` — upserts sample data |
| `src/lib/prisma.ts` | PrismaClient singleton with `@prisma/adapter-pg` + dev query logging |
| `phase-2.md` | Design doc (normalization, UUIDs, soft delete, indexing, RLS-ready design) |

---

## Phase 3 — Authentication System

### Auth flow

```
Signup → bcrypt hash → create User → create Session → return accessToken + refreshToken cookie
Login  → verify credentials → create Session → return tokens
Refresh → verify refresh token hash → revoke old Session → create new Session → rotate tokens
Logout → set revokedAt on current Session
```

### Security

- Passwords: bcryptjs with cost factor 12
- Access tokens: JWT HS256, 15-minute expiry, contains `{ sub: userId, sessionId }`
- Refresh tokens: 64-byte random hex, SHA-256 hashed in DB, 7-day expiry
- Tokens set as HTTP-only cookies: `HttpOnly; SameSite=Strict; Path=/api/auth`
- Access tokens also returned in JSON for mobile/SPA use
- Session table tracks hash, expiry, revocation — enables "logout all"

### API endpoints

| Method | Path | Auth | Response |
|---|---|---|---|
| POST | `/api/auth/signup` | No | 201 + user + accessToken + refreshToken cookie |
| POST | `/api/auth/login` | No | 200 + user + tokens |
| POST | `/api/auth/refresh` | Cookie | 200 + rotated tokens |
| POST | `/api/auth/logout` | Bearer | 200 + clear cookie |
| POST | `/api/auth/logout-all` | Bearer | 200 + revoke all sessions |
| GET | `/api/auth/me` | Bearer | 200 + user profile |

### Middleware stack for protected routes

```
requireAuth (verify JWT → attach req.user = { userId, sessionId })
```

### Key files

| File | Purpose |
|---|---|
| `src/utils/jwt.ts` | `signAccessToken`, `verifyAccessToken`, `generateRefreshToken` (opaque), `hashRefreshToken` |
| `src/utils/app-error.ts` | `AppError(message, statusCode)` class |
| `src/services/auth.service.ts` | signup, login, refresh (with rotation), logout, logoutAll, getMe |
| `src/controllers/auth.controller.ts` | HTTP handlers, cookie set/clear |
| `src/middleware/auth.middleware.ts` | `requireAuth` — Bearer token verification |
| `src/types/express.d.ts` | Global augmentation: `req.user: { userId, sessionId }` |
| `phase-3.md` | Design doc (bcrypt, JWT, rotation, CSRF, threat model) |

---

## Phase 4 — Multi-Tenant Isolation

### Isolation strategy (two-layer)

| Layer | Mechanism | What it prevents |
|---|---|---|
| 1 — Service | Explicit `where: { orgId }` in every Prisma query | Primary isolation |
| 2 — Database | PostgreSQL RLS policies | Defense-in-depth if developer forgets Layer 1 |

### RLS policies

Applied on: `Membership`, `Project`, `Invite`, `AuditLog`.

```sql
CREATE POLICY tenant_isolation ON "Project"
  FOR ALL USING ("orgId" = current_setting('app.current_org_id', TRUE));
```

### Connection pooling + RLS

Prisma uses `pg.Pool` — `SET app.current_org_id` on one connection doesn't affect others. Solution:
- `withOrg(fn)` helper wraps queries in `prisma.$transaction` + `SELECT set_config('app.current_org_id', $1, true)` (transaction-scoped)
- This guarantees RLS context is set in the same transaction/connection as the query

### Tenant context flow

```
Request → requireAuth (req.user) → requireOrg (X-Org-Id header)
  → verify Membership exists
  → AsyncLocalStorage<{ orgId, role, userId }> persists for request lifecycle
  → Service reads context via getOrgId() / withOrg()
```

### API endpoints

| Method | Path | Auth | Org | Description |
|---|---|---|---|---|
| POST | `/api/orgs` | Yes | No | Create org + auto-create OWNER membership |
| GET | `/api/orgs` | Yes | No | List user's orgs (with role) |
| GET | `/api/orgs/:id` | Yes | Yes | Get org details |
| PATCH | `/api/orgs/:id` | Yes | Yes | Update org (OWNER/ADMIN only — checked in Phase 5) |
| GET | `/api/orgs/:id/members` | Yes | Yes | List members |

### Key files

| File | Purpose |
|---|---|
| `src/lib/tenant-context.ts` | `AsyncLocalStorage` + `getTenantContext()` / `requireTenantContext()` |
| `src/middleware/tenant.middleware.ts` | `requireOrg` — reads `X-Org-Id`, verifies membership, sets async context |
| `src/utils/prisma-with-org.ts` | `withOrg(fn)` — RLS transaction wrapper; `getOrgId()`, `getRole()` helpers |
| `src/services/org.service.ts` | listUserOrgs, createOrg (auto-OWNER), getOrg, updateOrg, listMembers |
| `src/controllers/org.controller.ts` | HTTP handlers |
| `prisma/migrations/..._enable_rls/migration.sql` | Enables RLS + creates policies on 4 tables |
| `phase-4.md` | Design doc (RLS, pooling problem, two-layer isolation, org switching) |

### RLS verified

- Non-superuser (`app_user`) querying `Project` **without** `app.current_org_id` → **0 rows** (blocked)
- Non-superuser querying `Project` **with** `app.current_org_id` = org UUID → **1 row** (allowed)

---

# All phases complete

---

## Phase 5 — RBAC Authorization

### Goal

Restrict operations by role (OWNER > ADMIN > MEMBER).

### Tasks

- Create `requireRole("OWNER" | "ADMIN" | "MEMBER")` middleware
- Read role from `requireTenantContext().role` (set by middleware in Phase 4)
- Protect: delete org (OWNER only), invite member (OWNER/ADMIN), update org (OWNER/ADMIN), remove users (OWNER)
- Document: permission matrix, ABAC extension path

### Key files to create

- `src/middleware/rbac.middleware.ts` — `requireRole(...roles)`

---

## Phase 6 — Invite System

### Goal

Secure invite-based org onboarding.

### Tasks

- Signed invite token (JWT or HMAC), expiry, hashed in DB
- `POST /api/orgs/:id/invites` — (OWNER/ADMIN) create invite
- `POST /api/invites/accept` — validate token, create membership, invalidate invite
- Edge cases: duplicate user, expired invite, revoked invite, already-in-org

### Key files to create

- `src/services/invite.service.ts`
- `src/controllers/invite.controller.ts`
- `src/routes/invite.routes.ts`

---

## Phase 7 — Audit Logging

### Goal

Auto-capture create/update/delete on critical models.

### Tasks

- Prisma middleware (`$use`) intercepts all mutations
- `AsyncLocalStorage` propagates actor/org context automatically
- Store: model, modelId, action, data (JSON diff), actorId, orgId, timestamp

### Key files to create

- `src/lib/audit.ts` — Prisma middleware + audit helpers

---

## Phase 8 — Operational Features

### Goal

Production-grade runtime behavior.

### Tasks

- Redis-backed rate limiting (per-user, per-tenant)
- Structured logging with correlation IDs (pino-http already does req.id)
- Health checks: DB + Redis connectivity endpoints
- Prometheus metrics: latency, request count, error rate
- `POST /api/auth/login` brute-force protection (rate limit per IP)
- Graceful shutdown improvements (close Prisma + Redis connections)

### Key files to create

- `src/middleware/rate-limit.middleware.ts`
- `src/controllers/health.controller.ts` (update)
- `src/lib/metrics.ts`
- `src/server.ts` (update shutdown)

---

## Phase 9 — Testing Strategy

### Status: ✅ Complete

### What was built

- Jest 29 + `ts-jest` (ESM preset) + Testcontainers + Supertest test suite
- 27 integration tests across 4 suites: health, auth, org, invite
- Global setup starts Postgres + Redis Testcontainers, runs `prisma migrate deploy`
- Testcontainers connection info shared via `/tmp/test-containers.json`
- Test utilities: `signupUser`, `loginUser`, `createOrg`, `createInvite`, `cleanup`

### Key files

| File | Purpose |
|---|---|
| `jest.config.mjs` | ESM Jest config with moduleNameMapper |
| `src/tests/global-setup.mjs` | Start containers + run migrations |
| `src/tests/global-teardown.mjs` | No-op (auto-cleanup) |
| `src/tests/env-setup.ts` | Read container config, set env vars |
| `src/tests/helpers.ts` | Test utilities |
| `src/tests/health.test.ts` | Health check tests |
| `src/tests/auth.test.ts` | Auth flow tests (signup, login, refresh, logout, me) |
| `src/tests/org.test.ts` | Org CRUD + RBAC tests |
| `src/tests/invite.test.ts` | Invite create + accept tests |

---

## Phase 10 — Deployment

### Status: ✅ Design complete, artifacts created

### What was built

- Design document (`phase-10.md`) — architecture, resources, env vars, costs, security
- `scripts/setup-gcp.sh` — One-time GCP resource creation (VPC, Cloud SQL, Memorystore, Artifact Registry, secrets, IAM)
- `scripts/deploy.sh` — Build Docker image, push to Artifact Registry, deploy to Cloud Run
- `scripts/run-migrations.sh` — Run `prisma migrate deploy` against Cloud SQL via auth proxy
- `.github/workflows/ci.yml` — CI pipeline: lint → test → build on every push/PR
- `.github/workflows/deploy.yml` — Deploy pipeline: test → build → push → Cloud Run on push to main
- `cloudbuild.yaml` — Alternative GCP Cloud Build pipeline
- `Dockerfile` — Updated for production: Prisma generate at build, migrate deploy on startup

### Architecture

```
GitHub → CI (lint + test + build) → Artifact Registry → Deploy to Cloud Run
                                                              │
                      ┌───────────────────────────────────────┼───────────────────────┐
                      │                                       │                       │
                 Cloud SQL (PostgreSQL 16)          Memorystore (Redis 7)       Secret Manager
                      │                                       │
                      └───────────────────────────────────────┘
                              VPC Connector (serverless VPC access)
```

### Required GitHub secrets/vars

| Name | Type | Value |
|---|---|---|
| `GCP_SA_KEY` | Secret | JSON key for Cloud Run deploy SA |
| `GCP_PROJECT_ID` | Variable | Your GCP project ID |
| `GCP_REGION` | Variable | Deployment region (default: `us-central1`) |

---

## Phase 11 — Documentation

### Status: ✅ Complete

### What was built

- `README.md` — Project overview, architecture diagram, tech stack, quick start, API reference, project structure, deployment
- `DESIGN.md` — Architecture deep-dive, two-layer tenant isolation (RLS + service layer), RLS implementation details, auth token design, RBAC matrix, operational features, data model, tradeoffs, scaling
- `SECURITY.md` — Threat model, 10 attack vectors with mitigations, password policy, audit logging, dependency security, infrastructure security controls

---

# Current File Tree

```
server/
├── .env.example
├── .eslintrc.json
├── .github/
│   ├── CODEOWNERS
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── .gitignore
├── .husky/
│   └── pre-commit
├── .prettierrc
├── AGENTS.md
├── DESIGN.md
├── Dockerfile
├── PLAN.md                         ← this file
├── README.md
├── SECURITY.md
├── cloudbuild.yaml
├── docker-compose.yml
├── phase-10.md
├── package.json
├── phase-1.md through phase-4.md   ← design docs
├── prisma/
│   ├── config.ts
│   ├── migrations/                 ← 2 migrations (init + enable_rls)
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app.ts
│   ├── config/
│   │   └── env.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── health.controller.ts
│   │   └── org.controller.ts
│   ├── lib/
│   │   ├── logger.ts
│   │   ├── prisma.ts
│   │   └── tenant-context.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── request-logger.middleware.ts
│   │   └── tenant.middleware.ts
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── index.ts
│   │   └── org.routes.ts
│   ├── server.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   └── org.service.ts
│   ├── types/
│   │   ├── express.d.ts
│   │   └── index.ts
│   └── utils/
│       ├── app-error.ts
│       ├── jwt.ts
│       └── prisma-with-org.ts
└── tsconfig.json
```

---

# Key Patterns (for future context)

### Import convention
```typescript
import "dotenv/config";                  // side-effect (not in src/)
import { logger } from "@/lib/logger.js"; // path alias + .js extension
import type { Role } from "@/types/index.js"; // type-only import
```

### Adding a new domain (e.g., invites)
1. `src/services/invite.service.ts` — business logic (no req/res)
2. `src/controllers/invite.controller.ts` — parse body, call service, respond
3. `src/routes/invite.routes.ts` — define paths, apply middleware
4. Wire into `src/routes/index.ts`

### Middleware stack order
```typescript
app.use(express.json());         // 1. Parse body
app.use(cookieParser());         // 2. Parse cookies
app.use(requestLogger);          // 3. Log request
app.use("/api", routes);         // 4. Routes (auth → org → tenant → business)
app.use(errorHandler);           // 5. Catch all errors LAST
```

### Route middleware pattern
```typescript
router.get("/:orgId/members",
  requireAuth,     // JWT → req.user
  requireOrg,      // X-Org-Id → AsyncLocalStorage
  controller.listMembers
);
```

### Environment variables (Zod-validated)
```
DATABASE_URL      postgresql://postgres:postgres@localhost:5432/multitenant
REDIS_URL         redis://localhost:6379
JWT_ACCESS_SECRET min 32 chars
JWT_REFRESH_SECRET min 32 chars
```

### Docker commands
```bash
docker compose up -d          # Start Postgres + Redis
docker compose down -v        # Stop + wipe volumes
```

### Prisma commands
```bash
npm run db:migrate    # Create+apply migration
npm run db:deploy     # Apply in production
npm run db:seed       # Seed data
npm run db:reset      # Drop all + re-migrate + seed
npm run db:studio     # GUI browser
```
