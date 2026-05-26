# Project Context — Multi-Tenant SaaS Backend

> For comprehensive project context, read `PLAN.md` — it contains all phases, file tree, architecture decisions, and patterns.

---

## Overview

Production-grade multi-tenant backend demonstrating:
- Tenant isolation via PostgreSQL RLS
- RBAC authorization
- JWT authentication (access + refresh tokens)
- Invite-based org onboarding
- Audit logging
- Operational maturity (structured logging, metrics, rate limiting)
- GCP deployment (Cloud Run + Cloud SQL + Memorystore)

## Architecture

```
Client → Express API → Auth Middleware → Tenant Context → RBAC → Service → Prisma → PostgreSQL (RLS)
```

## Tech Stack

- **Runtime**: Node.js 22, TypeScript, Express 5
- **Database**: PostgreSQL 16 via Prisma ORM (v7, driver adapter: `@prisma/adapter-pg`)
- **Auth**: JWT (access 15m + refresh stored in DB)
- **Cache/Rate-Limiting**: Redis 7
- **Logging**: Pino (structured JSON)
- **Testing**: Jest + Supertest + Testcontainers
- **Deployment**: Docker → GCP (Cloud Run)

## Folder Structure

```
src/
  config/       # Zod env validation
  controllers/  # HTTP request/response handling
  lib/          # Prisma client, logger, shared infra
  middleware/   # Express middleware (auth, tenant, rbac, error)
  routes/       # Express router definitions
  services/     # Business logic (no HTTP awareness)
  types/        # Shared TS types
  utils/        # Pure helper functions
  tests/        # Jest test files (mirrors src/)
```

## Key Conventions

- ESM modules (`"type": "module"` in package.json)
- All imports use `.js` extension (required by `verbatimModuleSyntax`)
- Path alias `@/` maps to `src/`
- No `repositories/` layer — Prisma IS the repository
- Tenant isolation via PostgreSQL RLS (defense-in-depth) + explicit `orgId` filters
- Tenant context set via `X-Org-Id` header, validated by `requireOrg` middleware
- Use `withOrg()` helper for RLS-wrapped transactions; use `getOrgId()` for filters
- Services are pure business logic, no `req`/`res` access
- Controllers parse input, call service, format response

## Naming Conventions

- Files: `kebab-case` (e.g., `auth.service.ts`, `error.middleware.ts`)
- Exports: named exports, not default exports
- Routes: `router.get("/resource", handler)`
- Controllers: `export const methodName`

## Phase Status

| Phase | Status |
|-------|--------|
| 1 — Project Foundation | ✅ Done |
| 2 — Database Design | ✅ Done |
| 3 — Authentication | ✅ Done |
| 4 — Multi-Tenant Isolation | ✅ Done |
| 5 — RBAC Authorization | ✅ Done |
| 6 — Invite System | ✅ Done |
| 7 — Audit Logging | ✅ Done |
| 8 — Operational Features | ✅ Done |
| 9 — Testing Strategy | ✅ Done |
| 10 — Deployment | ✅ Done |
| 11 — Documentation | ✅ Done |

## GCP Deployment

### One-time setup
```bash
./scripts/setup-gcp.sh <PROJECT_ID> [REGION]
```

### Build & deploy
```bash
./scripts/deploy.sh <PROJECT_ID> [REGION] [SERVICE_NAME]
```

### Run migrations
```bash
./scripts/run-migrations.sh <PROJECT_ID> [REGION]
```

### CI/CD
- `.github/workflows/ci.yml` — Runs lint, test, build on every push
- `.github/workflows/deploy.yml` — Deploys to Cloud Run on push to `main`

### Required GitHub secrets/vars
| Name | Type | Value |
|---|---|---|
| `GCP_SA_KEY` | Secret | JSON key for Cloud Run deploy SA |
| `GCP_PROJECT_ID` | Variable | Your GCP project ID |
| `GCP_REGION` | Variable | Deployment region (default: `us-central1`) |

## Commands

```bash
npm run dev        # Start dev server with hot reload
npm run build      # Compile TypeScript → dist/
npm run start      # Run compiled production build
npm run lint       # ESLint check
npm run format     # Prettier format
npm test           # Run Jest tests
npm run db:migrate # Create/apply Prisma migration
npm run db:deploy  # Apply migrations in production
npm run db:seed    # Seed database
npm run db:reset   # Drop all + re-migrate + seed
npm run db:studio  # Open Prisma Studio (GUI)
```

## Docker

```bash
docker compose up -d          # Start Postgres + Redis
docker compose down -v        # Stop + delete volumes
```

## Environment

See `.env.example` for required vars. Validation via `src/config/env.ts` (Zod schema).
