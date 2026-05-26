# Phase 9 — Testing Strategy

## Goal

Establish a robust test suite with Testcontainers for database isolation, covering unit and integration tests across all API endpoints.

---

## 1. Testing Stack

| Tool | Purpose |
|---|---|
| Jest 29 | Test runner (ESM mode) |
| `ts-jest` | TypeScript transformer (ESM) |
| Supertest | HTTP assertions |
| Testcontainers | Postgres + Redis containers per test run |

## 2. Test Architecture

### Global Setup (`src/tests/setup.ts`)
- Starts Postgres + Redis containers via Testcontainers
- Sets `DATABASE_URL` and `REDIS_URL` env vars
- Runs Prisma migrations (`prisma migrate deploy`)
- Seeds test data

### Per-Test Isolation
- Each test suite wraps operations in a transaction
- Test data is cleaned up via `DELETE` after each suite

### Test File Structure
```
src/tests/
├── setup.ts             # Global setup (containers, migrations)
├── teardown.ts          # Global teardown (stop containers)
├── helpers.ts           # Test utilities (signup helper, etc.)
├── health.test.ts       # Health endpoint
├── auth.test.ts         # Signup, login, refresh, logout, me
├── org.test.ts          # Org CRUD, RBAC, membership
└── invite.test.ts       # Invite flow
```

## 3. Environment Variables

Testcontainers dynamically allocates ports. The setup script:
1. Starts containers
2. Reads connection URIs from containers
3. Sets `DATABASE_URL` and `REDIS_URL` as env vars
4. Runs `prisma migrate deploy` for schema
5. Returns teardown function

## 4. Coverage Goals

| Area | What's Tested |
|---|---|
| Health | Status, DB/Redis connectivity, degraded mode |
| Auth | Signup (success, duplicate, missing fields), Login (success, wrong password), Refresh (valid, expired), Logout, Me |
| Org | Create, list, get, update, RBAC (MEMBER can't delete, ADMIN can update) |
| Invites | Create (ADMIN+), Accept (valid token, wrong email, expired, duplicate) |
| Rate Limiting | Brute force blocking after N failures |

## 5. Commands

```bash
npm test          # Run full suite
npm run test:unit # Unit tests only (future)
```
