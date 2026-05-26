# Security Document — Multi-Tenant SaaS Backend

## Threat Model

### Assets

| Asset | Sensitivity | Location |
|---|---|---|
| User passwords | Critical | bcrypt hash in User table |
| JWT access tokens | High | Memory (client) |
| Refresh tokens | High | SHA-256 hash in Session table |
| Tenant data (orgs, projects) | High | PostgreSQL (RLS-protected) |
| Invite tokens | Medium | SHA-256 hash in Invite table |
| API keys (if any) | High | Secret Manager / Redis |
| Audit logs | Low | AuditLog table |
| Rate-limit data | Low | Redis |

### Trust Boundaries

```
[Client] ──HTTPS──> [Cloud Run] ──VPC──> [Cloud SQL + Memorystore]
                        │
                   [Secret Manager]
```

- Client → API: TLS (HTTPS in production)
- API → DB: Private VPC (Cloud SQL with private IP or Unix socket)
- API → Redis: Private VPC (Memorystore with VPC connector)
- API → Secrets: IAM-authenticated API calls to Secret Manager

---

## Attack Vectors & Mitigations

### 1. Tenant Data Leakage

**Risk**: Tenant A reads or modifies Tenant B's data.

**Mitigation (Two-Layer Defense)**:
- Layer 1: Every service-layer Prisma query includes `where: { orgId }` — explicit filtering is the primary guard
- Layer 2: PostgreSQL RLS policies on all tenant-scoped tables — if a query misses `orgId`, RLS returns 0 rows

**Residual risk**: RLS configuration error or misapplied migration. Mitigated by:
- RLS-active `app_user` role that cannot disable RLS policies
- Integration tests that verify cross-tenant isolation (test agent A cannot access agent B's org)

### 2. Token Theft (Access Token)

**Risk**: Attacker steals a JWT access token (15-minute window).

**Mitigation**:
- Short expiry (15 minutes) limits the damage window
- Tokens are not stored in the DB — no DB leak exposure
- HTTPS-only transmission

### 3. Token Theft (Refresh Token)

**Risk**: Attacker steals the refresh token cookie.

**Mitigation**:
- **Rotation**: Every refresh invalidates the previous token and issues a new one
- **Replay detection**: If a revoked token is reused, it indicates theft and all sessions for that user are invalidated
- `HttpOnly` + `SameSite=Strict` cookie flags prevent XSS/CSRF
- `Path=/api/auth` limits cookie scope
- 7-day expiry bounds the window

### 4. SQL Injection

**Mitigation**:
- Prisma parameterizes all queries by default
- Raw queries (used only in `set_config` for RLS) use `$executeRawUnsafe` with explicit parameter binding
- No string concatenation in queries

### 5. Brute-Force Login

**Mitigation**:
- Per-email rate limiting: 5 failed attempts → 15-minute block
- Implemented via Redis `INCR` + `PEXPIRE` for atomicity
- Successful login clears the counter
- General auth endpoint rate limit: 10 requests / 15 minutes per IP

### 6. Privilege Escalation

**Risk**: A MEMBER performs ADMIN-only actions.

**Mitigation**:
- `requireMinRole` middleware checks role from `AsyncLocalStorage` (set by org middleware)
- Role is re-verified on every request (not cached beyond the request lifetime)
- Role hierarchy is enforced at the middleware level, not in the business logic

### 7. Invite Token Theft

**Risk**: Attacker intercepts an invite link/token.

**Mitigation**:
- Tokens are 64-byte random hex (256 bits of entropy) — infeasible to guess
- Tokens are stored as SHA-256 hash in the DB — no plaintext exposure on DB leak
- Tokens expire (configurable `expiresAt`)
- Tokens are single-use (marked as accepted after use)
- Tokens can be revoked (admins can set `revokedAt`)
- Email-only validation: the token can only be accepted by the email it was issued to

### 8. Session Hijacking

**Mitigation**:
- Access tokens are short-lived (15 minutes)
- Refresh tokens are rotated on every use
- `revokedAt` column enables instant session invalidation
- "Logout all" feature revokes every session for a user

### 9. CSRF (Cross-Site Request Forgery)

**Mitigation**:
- Refresh tokens use `SameSite=Strict` — cookie is not sent on cross-site requests
- No sensitive mutating endpoints accept cookie-only auth (require Bearer header)
- All state-changing operations require a Bearer token (not cookies)

### 10. XSS (Cross-Site Scripting)

**Mitigation**:
- All tokens are `HttpOnly` — JavaScript cannot read them
- No user input is reflected in HTML (JSON API only)
- No template rendering engine in use

---

## Password Policy

- Algorithm: bcrypt (cost factor 12)
- Implementation: `bcryptjs` (pure JavaScript, no native compilation needed)
- No plaintext storage
- No password recovery endpoint (for demo scope — would add in production)

## Audit Logging

Every create, update, and delete on critical models (User, Organization, Membership, Project, Invite) is automatically captured:

```json
{
  "actorId": "user-uuid",
  "orgId": "org-uuid",
  "action": "CREATE",
  "model": "Membership",
  "modelId": "membership-uuid",
  "data": { "userId": "...", "orgId": "...", "role": "MEMBER" },
  "createdAt": "2026-01-01T00:00:00Z"
}
```

- Actor identity is captured via `AsyncLocalStorage` (set by `requireAuth`)
- Cannot be tampered with by the application layer (written by Prisma middleware)
- Audit logs are append-only (no update/delete in the middleware)

## Dependency Security

- All dependencies are checked via `npm audit` on CI
- `bcryptjs` avoids native compilation issues in Alpine (Cloud Run)
- Regular dependency updates via Dependabot (`.github/dependabot.yml`)
- Prisma client is generated at build time (pinned to schema)

## Infrastructure Security

| Control | Implementation |
|---|---|
| TLS termination | Cloud Run (automatic HTTPS) |
| Secret storage | Secret Manager (not env files) |
| DB encryption | Cloud SQL (encrypted at rest) |
| Redis encryption | Memorystore (encrypted at rest) |
| Network isolation | Private VPC for Cloud SQL + Memorystore |
| Container isolation | Cloud Run (sandbox per request) |
| IAM | Least-privilege service account |

## Reporting

For security issues, please open a GitHub issue or contact the repository maintainer.
