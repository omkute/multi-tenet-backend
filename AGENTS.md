# Project Context — Multi-Tenant SaaS Backend

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
- **Database**: PostgreSQL 16 via Prisma ORM
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
| 2 — Database Design | 🔜 Next |
| 3 — Authentication | ⏳ |
| 4 — Multi-Tenant Isolation | ⏳ |
| 5 — RBAC Authorization | ⏳ |
| 6 — Invite System | ⏳ |
| 7 — Audit Logging | ⏳ |
| 8 — Operational Features | ⏳ |
| 9 — Testing Strategy | ⏳ |
| 10 — Deployment | ⏳ |
| 11 — Documentation | ⏳ |

## Commands

```bash
npm run dev       # Start dev server with hot reload
npm run build     # Compile TypeScript → dist/
npm run start     # Run compiled production build
npm run lint      # ESLint check
npm run format    # Prettier format
npm test          # Run Jest tests
```

## Docker

```bash
docker compose up -d          # Start Postgres + Redis
docker compose down -v        # Stop + delete volumes
```

## Environment

See `.env.example` for required vars. Validation via `src/config/env.ts` (Zod schema).
