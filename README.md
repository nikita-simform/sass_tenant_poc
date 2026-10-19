# Multi-Tenant Subscription Management POC

A proof of concept for a SaaS platform where every organization's data is isolated from every
other's **as a property of the architecture** — not because every engineer remembered to add a
`WHERE tenant_id = ...` clause — plan limits are enforced (including under real concurrency), and
a new organization can onboard itself without engineering involvement.

Built for the **React to Full Stack — 101** learning path (Next.js implementation path), on
Next.js 16 (App Router) + TypeScript + PostgreSQL + Prisma 7.

## Problem this solves

A product serving multiple client organizations had no real wall between them: a query missing a
filter could leak one org's data into another's response, plan limits existed only as numbers
nobody enforced, and onboarding a new client meant an engineer manually creating rows. This POC's
center of gravity is **structural tenant isolation**.

## The isolation mechanism (read this first)

Rather than one shared `Resource` table with a `tenant_id` column every query must remember to
filter by, this uses a **hybrid schema-per-tenant model**:

- **Shared `public` schema** — control plane: `Organization`, `Plan`, `User`, `Invite`,
  `AuditLog`, `TenantMigration`. Needed for login (looking a user up by email before you know
  which org they belong to) and for platform-admin aggregate queries.
- **One Postgres schema per organization** (`org_<slugified-name>`, e.g. `org_acme_corp`) — the
  tenant's actual content (`Resource`). Physically separate tables per org, not rows sharing one
  table.

At request time: a user logs in → the shared `User` table resolves their `organizationId` and
their org's `schemaName` → a signed JWT carries those claims → `withTenant` (see
[`src/lib/middleware/withTenant.ts`](src/lib/middleware/withTenant.ts)) resolves a Prisma client
connected **only** to that schema and hands it to the route handler.

**Why this beats "remember the WHERE clause":** a `Resource` route has no `organizationId` column
to filter by and nothing to forget — it structurally cannot see another org's rows, because its
database connection was never pointed at that schema. `tests/isolation.test.ts` proves this by
requesting a resource ID that belongs to a different org (getting `NotFoundError`, not another
org's data) and by directly querying one org's tenant client for a resource name that only exists
in another org's schema.

**Platform admin's boundary is the same shape, inverted:** platform-admin code
([`src/lib/services/platform.ts`](src/lib/services/platform.ts)) imports *only*
`src/lib/db/public.ts` — it never imports `src/lib/db/tenant.ts`, so there is no code path by
which it could reach any org's content, even by accident. Verified live: hitting
`/api/resources` as a platform admin returns `403 FORBIDDEN` ("requires membership in an
organization"), and hitting `/api/platform/orgs` as an org admin returns `403 FORBIDDEN`
("Platform admin access required").

### Evolving the tenant schema over time

A live `tenant_template` schema (not just a file) is the canonical reference for what a tenant
schema should look like. Structural changes are authored once, against it, via real
`prisma migrate dev` (`npm run tenant:migrate:dev`) — this generates versioned SQL under
`prisma/tenant-schema/migrations/`. `scripts/apply-tenant-migrations.ts` then replays any
not-yet-applied migration file against every real org schema (tracked per-schema in
`TenantMigration`), and a brand-new org replays the full migration history into its fresh schema
at signup time — so every tenant schema always converges on the same structure, evolved through
ordinary version-controlled migrations rather than hand-copied DDL.

## Onboarding (self-service, no engineering involvement)

Signup (`POST /api/signup`) runs as **one Postgres transaction**: `CREATE SCHEMA org_x` → replay
the tenant-schema migration history into it → insert `Organization` + admin `User` rows into
`public`. Postgres DDL is transactional, so a failure at any point — including partway through
the migration replay — rolls back the schema creation too. No half-created org, no orphaned
schema, safe to retry. `tests/onboarding.test.ts` forces a real failure mid-transaction and
asserts nothing was left behind (no `Organization` row, no `User` row, no `org_*` schema).

Schema names are derived from the organization's name via `deriveSchemaName()`
([`src/lib/db/tenantSchemaMigrations.ts`](src/lib/db/tenantSchemaMigrations.ts)) — readable
(`org_acme_corp`), but never raw user text: only `[a-z0-9]` survives, everything else collapses
to `_`, accents are stripped, and the result is re-validated by `assertSafeSchemaName` before
ever being interpolated into `CREATE SCHEMA` / `SET search_path` DDL, which is otherwise a
SQL-identifier-injection vector. `Organization.name` has a DB-level unique constraint, so
duplicate names are rejected with a specific error ("An organization with this name already
exists") rather than a generic failure — enforced atomically (the same pattern as the seat-limit
guard below), not just by a pre-check, so two concurrent signups with the same name can't both
succeed. See `tests/schemaName.test.ts` for the slugification behavior and
`tests/validation.test.ts` for the duplicate-name rejection.

## Plan limits under concurrency

Inviting a user attempts an atomic conditional update:

```sql
UPDATE "Organization" o SET "userCount" = o."userCount" + 1
FROM "Plan" p
WHERE o.id = $1 AND p.id = o."planId" AND o."userCount" < p."maxUsers"
RETURNING o.id
```

This single statement's `WHERE` clause is re-evaluated against the row's current committed value
while holding that row's lock, so two concurrent invites against the same org **serialize** on it
— the loser sees zero rows updated, even under Postgres's default READ COMMITTED isolation. A
separate "count, then insert if under the limit" would **not** be safe: both transactions could
read the same count before either commits. `tests/concurrency.test.ts` fires two simultaneous
invites at an org one seat from its cap and asserts exactly one succeeds (verified live in the
browser too — trying a third invite once at the cap returns a specific "reached its plan's seat
limit" message, not a generic error, and the count does not move).

### Changing plans

An org admin can switch plans from the dashboard (`PATCH /api/orgs/:orgId/plan`,
[src/lib/services/orgs.ts](src/lib/services/orgs.ts)) — this is what actually resolves the seat-limit
message above ("reached its plan's seat limit. Upgrade the plan...") into something the admin can
act on immediately, in the same session. A downgrade is refused with a specific reason if current
usage wouldn't fit the target plan (e.g. 4 users on a 3-seat plan), using the same
pre-check-plus-atomic-update pattern as the seat-limit guard, so a plan change racing against a
concurrent invite can't leave the organization over its new limit either.

## Data model

| Model | Schema | Purpose |
|---|---|---|
| `Organization` | `public` | Tenant record: name, `schemaName`, plan, live `userCount`/`storageUsedMB` |
| `Plan` | `public` | `maxUsers`, `maxStorageMB` — static reference data (Free/Pro/Enterprise) |
| `User` | `public` | `organizationId` nullable **only** for `PLATFORM_ADMIN` (belongs to no org) |
| `Invite` | `public` | Audit record of a provisioned user (see "Known simplifications" below) |
| `AuditLog` | `public` | Structured trace: onboarding, limit rejections, every action |
| `TenantMigration` | `public` | Which tenant-schema migration files have been applied to which schema |
| `Resource` | per-tenant | The actual content; the thing plan storage limits would cap |

## API surface

| Route | Method(s) | Access |
|---|---|---|
| `/api/signup` | POST | Anonymous — the one intentional exception |
| `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` | POST / POST / GET | Auth |
| `/api/resources`, `/api/resources/:id` | GET/POST, GET/PATCH/DELETE | Org admin or member (tenant-scoped) |
| `/api/orgs/:orgId`, `/api/orgs/:orgId/plan`, `/api/orgs/:orgId/users`, `/api/orgs/:orgId/users/:userId` | GET / PATCH / GET,POST / PATCH,DELETE | Org admin only, re-scoped to their own org regardless of the path param |
| `/api/platform/orgs` | GET | Platform admin only, public-schema data only |

`GET /api/resources` supports `?page=&pageSize=&sortBy=(createdAt|name|sizeBytes)&sortDir=(asc|desc)&search=` — full pagination, allowlisted sorting, and name filtering, all enforced at the database query, not by loading everything into memory and filtering in code (see [src/lib/services/resources.ts](src/lib/services/resources.ts)). The dashboard's Resources section exposes all of this directly (search box, sort dropdown, page controls), and the resource detail page (`/dashboard/resources/:id`) is where Update happens — the full CRUD set (create/list/read/update/delete) is clickable end-to-end, not just reachable via the API.

Every route validates input with **Zod** before any business logic runs, every non-anonymous
route requires a verified session (`withAuth`), and every error maps to a consistent
`{ error: { code, message } }` shape via a centralized handler
([`src/lib/middleware/errorHandler.ts`](src/lib/middleware/errorHandler.ts)) — expected failures
(validation, limits, auth, not-found) get specific messages; anything unexpected becomes a safe
generic 500, logged server-side.

## Auth & authorization

- **JWT in an httpOnly cookie**, signed with `JWT_SECRET`, carrying `{userId, role,
  organizationId, schemaName}`. Verified on every request — nothing tenant-related is ever
  trusted from a client-supplied header, query param, or path segment.
- Org-admin routes re-derive scope from the caller's own session
  (`requireOrgAdminFor`), not the `:orgId` path param — a request naming another org's ID is
  rejected before touching business logic, and `tests/authorization.test.ts` proves an org admin
  cannot remove or change the role of another org's user by ID.
- Passwords hashed with **bcrypt**. No live Azure Entra ID integration — the RM's spec requires
  the whole system to run via `docker compose up` + a documented `.env` with no external setup,
  which a real Entra ID tenant would break. JWT verification sits in exactly the middleware slot
  an OIDC token check would occupy in production (see "Production mapping" below).

## Known simplifications (deliberate, documented, not oversights)

- **No real email delivery.** "Inviting" a user provisions their account immediately with a
  server-generated temporary password, returned once in the API response for the admin to share
  out of band. A real product would send a signup-link email instead.
- **Session claims are not revoked mid-flight.** A role change or removal takes effect on that
  user's *next* login (session TTL: 12h) — there's no server-side revocation list. Reasonable for
  a POC; a production system would likely shorten the TTL and add a refresh/revocation path.
- **Tenant connection pooling is bounded but simple**: an LRU cache of the 50 most recently used
  tenant Prisma clients (3 pooled connections each). Fine for a handful of demo orgs; a real
  deployment at scale would need a smarter eviction/connection budget.

## Running it

```bash
cp .env.example .env   # fill in JWT_SECRET and the seed platform-admin credentials
docker compose up
```

This builds the app image, starts Postgres, and (via `docker-entrypoint.sh`) applies control-plane
migrations, seeds default plans + the platform admin, applies tenant-schema migrations to
`tenant_template`, propagates them to any existing org schemas, then starts the app on
`localhost:3000`. Verified working end-to-end (all four setup steps, then a live login as the
seeded platform admin against the running container). Postgres itself is reachable on the host at
`localhost:5433` (not 5432) if you want to connect a local `psql`/GUI client directly — remapped
to avoid colliding with a Postgres already running locally, a common setup; the app container
always talks to it over Docker's internal network regardless of this host-side port.

### Running it without a `.env` file (production)

`.env` is gitignored and never committed — a real deployment target has no such file sitting on
it at all. `docker-compose.yml` doesn't read one directly for secrets (no `env_file:` for the
`app` service); instead `JWT_SECRET`, `SEED_PLATFORM_ADMIN_EMAIL`, and
`SEED_PLATFORM_ADMIN_PASSWORD` are referenced as `${VAR:?...}` — Compose resolves each from
whatever's already in the process environment `docker compose up` is invoked with, and **fails
immediately** with a clear error naming the missing variable if it isn't set, rather than silently
starting with an empty secret. Set them however your deployment target actually supplies
environment variables — shell `export`, a CI/CD pipeline's secret injection, `systemd`'s
`Environment=`, or (per the Azure mapping below) Key Vault values surfaced through the platform's
own secret-to-env mechanism — then run `docker compose up` exactly as before.

Local dev needs no extra step for this: Compose separately auto-loads a file literally named
`.env` next to `docker-compose.yml`, if one exists, purely to fill in `${...}` placeholders like
these — so `cp .env.example .env` still works exactly as it did before. That auto-load is a
different mechanism from the `env_file:` key (which would inject a whole file into the container
directly) — it only ever supplies values for the three placeholders named explicitly in the compose
file, nothing more.

### Local development (outside Docker)

```bash
npm install
npm run prisma:migrate        # control-plane schema
npm run tenant:migrate:dev    # tenant-schema, against tenant_template
npm run seed
npm run dev
```

### Logging in as each role

- **Org admin**: self-service — go to `/signup`, create an organization. The account that creates
  it is that org's admin.
- **Org member**: an org admin invites one from the dashboard (`/dashboard` → Team → Invite). No
  real email delivery in this POC — the invite response returns a one-time temporary password for
  the admin to hand off out of band.
- **Platform admin**: **not self-service, by design** — a platform admin isn't a member of any
  organization, so there's no "sign up as platform admin" flow to have. The one seeded account
  comes from `SEED_PLATFORM_ADMIN_EMAIL` / `SEED_PLATFORM_ADMIN_PASSWORD` in your `.env`, created
  by `prisma/seed.ts` (run automatically by `docker-entrypoint.sh`, or via `npm run seed` locally).
  Log in at `/login` with those exact credentials to reach `/platform`.
  - `prisma/seed.ts` only *creates* this user if it doesn't already exist — it never updates the
    password on an existing row. If you change `SEED_PLATFORM_ADMIN_PASSWORD` in `.env` after the
    first seed run, re-running `npm run seed` won't pick up the new password; delete that `User`
    row first (or change the email) if you need to rotate it locally.

#### Provisioning additional platform admins

There's deliberately no API route for this — creating a platform admin isn't something any
authenticated user should ever be able to trigger, self-service or otherwise. To add another one,
run the same ops-script pattern used for tenant migrations:

```bash
npm run platform-admin:create -- --email=someone@example.com --password=at-least-8-chars
# inside Docker: docker compose exec app npm run platform-admin:create -- --email=... --password=...
```

Idempotent (re-running for an existing platform admin no-ops) and refuses to promote an existing
org-scoped user (a role change like that should be an explicit, separate decision, not a side
effect of typing the wrong email). See `src/lib/services/platformAdmin.ts` and
`tests/platformAdmin.test.ts`.

### Tests

```bash
npm run test
```

Integration tests against a real Postgres (the one in `.env`) — each test creates uniquely-named
organizations and cleans up after itself (drops its own schema, deletes its own rows), so it's
safe to run against your dev database.

| Test file | Proves |
|---|---|
| `tests/isolation.test.ts` | Cross-tenant resource access by ID fails; own-org access succeeds |
| `tests/concurrency.test.ts` | Two simultaneous invites at the seat cap → exactly one succeeds |
| `tests/onboarding.test.ts` | A forced mid-transaction failure leaves no orphaned org/schema/user |
| `tests/validation.test.ts` | Malformed input and unknown plans are rejected before business logic |
| `tests/authorization.test.ts` | An org admin cannot act on another org's user by ID |
| `tests/schemaName.test.ts` | Org-name-to-schema-name slugification is safe and readable for any input |
| `tests/session.test.ts` | Logout's cookie-clear actually matches and removes the login cookie |
| `tests/platformAdmin.test.ts` | Platform admin creation is idempotent and can't silently promote an existing user |
| `tests/resources.test.ts` | CRUD, pagination (disjoint pages), sorting (asc/desc), and search filtering all behave correctly |
| `tests/plan.test.ts` | Upgrading/downgrading a plan, and the seat-limit interaction with it |
| `tests/plan.test.ts` | Plan upgrades/downgrades are refused when current usage doesn't fit; upgrading lifts a seat-limit block |

## Production mapping (Azure) — not deployed, understanding documented

- **Container Apps** (over App Service) — a better fit than App Service specifically because this
  app already has real container-startup logic (`docker-entrypoint.sh`); Container Apps is built
  around "here's an image, here's how it scales," not code deployed directly to a platform.
- **Azure Database for PostgreSQL (Flexible Server)** in place of the local/compose Postgres —
  same schema-per-tenant model, same migration-propagation script; only the connection URLs change.
- **Key Vault + Managed Identity** for `JWT_SECRET`, `DATABASE_URL`, `SEED_PLATFORM_ADMIN_PASSWORD`
  — the app fetches these using its own Azure identity at startup, instead of a plain `.env` file.
- **Application Insights**, fed by the same structured `pino` logs and `AuditLog` rows already
  produced here — the "detect a tenant leak in production" stretch goal (a scan for `Resource`
  foreign keys resolving to the wrong org) is exactly the kind of query that would become an
  Insights-backed alert.
- **Azure Entra ID** would replace the bespoke JWT issuance: `withAuth`/`getSessionFromRequest`
  already isolate "how is this request authenticated" into one place, so swapping in OIDC token
  validation there is a contained change, not a rewrite.
- **Known gap if scaled to multiple replicas**: `docker-entrypoint.sh` re-runs the full
  migrate/seed/tenant-migrate/propagate sequence on every container start, which is correct and
  verified for one instance but would mean every replica redundantly repeating those checks
  concurrently. The individual steps are written defensively (`prisma migrate deploy` is safe to
  re-run, `apply-tenant-migrations.ts` checks `alreadyApplied` first), so this likely wouldn't
  corrupt anything — but the real fix is splitting one-time setup into a separate Container Apps
  Job or CI/CD predeploy step, not baking it into every replica's own startup. Deliberately left
  as-is for this POC (single instance, already verified working); flagged here as the first thing
  to change before scaling out.
