# Multi-Tenant SaaS Backend

A production-grade multi-tenant SaaS backend with PostgreSQL Row-Level Security, RBAC authorization, JWT authentication, invite-based onboarding, audit logging, and operational maturity. Designed for GCP deployment (Cloud Run + Cloud SQL + Memorystore).

## Architecture

```
Client → Express API → requireAuth (JWT) → requireOrg (X-Org-Id) → Service (business logic) → Prisma → PostgreSQL (RLS)
                                                                                                  ↓
                                                                                              Redis (rate-limit)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, TypeScript 6, Express 5 |
| Database | PostgreSQL 16 via Prisma 7 (`@prisma/adapter-pg` driver adapter) |
| Auth | bcryptjs (password hashing), JWT HS256 (15m access tokens), opaque refresh tokens (SHA-256 hashed in DB) |
| Cache | Redis 7 (rate limiting, brute-force protection) |
| Logging | Pino 10 + pino-http (structured JSON, request correlation IDs) |
| Validation | Zod 4 (env config, request validation) |
| Testing | Jest 30 + Supertest + Testcontainers (27 integration tests) |
| Deployment | Docker → GCP (Cloud Run + Cloud SQL + Memorystore) |
| CI/CD | GitHub Actions (lint → test → build → deploy) |

## Features

- **Multi-Tenant Isolation**: Two-layer defense — explicit `orgId` filters in Prisma queries + PostgreSQL Row-Level Security policies
- **JWT Authentication**: Access/refresh token rotation, session management, HTTP-only cookies
- **RBAC Authorization**: Role hierarchy (OWNER > ADMIN > MEMBER), middleware-based enforcement
- **Invite System**: Secure org onboarding with hashed invite tokens, expiry, revocation
- **Audit Logging**: Automatic capture of create/update/delete on all critical models via Prisma `$extends`
- **Operational Features**: Redis-backed rate limiting (sliding window), brute-force protection, Prometheus metrics (`/metrics`), health checks (`/health`)
- **Graceful Shutdown**: SIGTERM/SIGINT handler closes HTTP server + Redis connection with 10s timeout

## Quick Start

### Prerequisites

- Node.js 22+
- Docker (for local PostgreSQL + Redis)

### Setup

```bash
# Clone and install
git clone <repo-url> && cd server
npm install

# Start infrastructure
docker compose up -d

# Configure environment
cp .env.example .env
# Edit .env with your secrets (or use defaults for local dev)

# Run migrations + seed
npm run db:deploy
npm run db:seed

# Start development server
npm run dev
```

### Test

```bash
npm test
```

Runs 27 integration tests against ephemeral Testcontainers (PostgreSQL + Redis).

## API Overview

### Auth (`/api/auth`)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/signup` | — | Create account |
| POST | `/login` | — | Sign in |
| POST | `/refresh` | Cookie | Rotate tokens |
| POST | `/logout` | Bearer | End session |
| GET | `/me` | Bearer | Current user |

### Organizations (`/api/orgs`)

| Method | Path | Auth | Org | Min Role | Description |
|---|---|---|---|---|---|
| POST | `/` | Yes | — | — | Create org (auto-OWNER) |
| GET | `/` | Yes | — | — | List my orgs |
| GET | `/:id` | Yes | Yes | MEMBER | Org details |
| PATCH | `/:id` | Yes | Yes | ADMIN | Update org |
| GET | `/:id/members` | Yes | Yes | MEMBER | List members |

### Invites (`/api/orgs/:orgId/invites`, `/api/invites`)

| Method | Path | Auth | Org | Min Role | Description |
|---|---|---|---|---|---|
| POST | `/` | Yes | Yes | ADMIN | Create invite |
| POST | `/accept` | Yes | — | — | Accept invite token |

### Operational

| Method | Path | Description |
|---|---|---|
| GET | `/health` | DB + Redis connectivity |
| GET | `/metrics` | Prometheus metrics |

## Project Structure

```
src/
├── config/        # Zod env validation
├── controllers/   # HTTP request/response handling
├── lib/           # Prisma client, logger, Redis, metrics, audit, user-context
├── middleware/    # Express middleware (auth, tenant, rbac, error, rate-limiter)
├── routes/        # Express route definitions
├── services/      # Business logic (no HTTP awareness)
├── tests/         # Jest integration tests
├── types/         # Shared TypeScript types
└── utils/         # Pure helper functions (JWT, AppError, RLS helpers)

prisma/
├── schema.prisma  # 7 models, Role enum
├── migrations/    # Migration history
└── seed.ts        # Sample data

scripts/           # GCP deployment scripts
.github/workflows/ # CI/CD pipelines
```

## Deployment

```bash
# One-time GCP setup
./scripts/setup-gcp.sh <project-id>

# Deploy
./scripts/deploy.sh <project-id>
```

See `phase-10.md` for detailed deployment architecture.
