# Runtruck TMS — Development Architecture

| | |
| --- | --- |
| **Document type** | Master development architecture |
| **Project** | Runtruck TMS (`github.com/Notmashiat/Runtruck1`) |
| **Version** | 1.0 — draft for owner approval |
| **Date** | 2026-09-30 |
| **Architecture style** | Modular monolith + transactional-outbox event processing |
| **Language** | TypeScript everywhere (strict) |
| **Web** | React 19 + Vite + React Router 7 (single-page app), static marketing site |
| **API** | NestJS (Fastify adapter), REST, versioned |
| **Database** | PostgreSQL (managed, point-in-time recovery) + Drizzle ORM |
| **Jobs** | BullMQ on Redis, fed by a transactional outbox |
| **Files** | S3-compatible object storage |
| **Mobile** | React Native + Expo (driver app) |
| **Repo** | pnpm workspaces + Turborepo monorepo |

This is the rulebook for building Runtruck. It says what the system is made of, where each
responsibility lives, what "fast" and "reliable" mean in numbers, and how anyone — a developer or
Claude — must work on it. Detailed specifications (database, API, lifecycles, …) live in the
separate documents listed in §39 and must agree with this one.

Decisions marked **Proposed** need the owner's approval before work that depends on them starts.
Decisions marked **Accepted** can be built on.

---

## Contents

1. Purpose and scope
2. Where Runtruck is today
3. Quality targets — what "runs smoothly" and "optimized" mean
4. Architecture decisions
5. Core principles
6. System architecture
7. Repository structure
8. Web front end
9. API back end
10. Data architecture
11. Multi-tenancy
12. Authentication
13. Authorization, roles and permissions
14. API conventions
15. Validation
16. Load domain and state machines
17. Dispatch
18. Planner (calendar)
19. Billing, settlements and payables
20. Fleet, safety, HR and compliance data
21. Documents
22. Events, outbox and background jobs
23. Notifications and real-time updates
24. Integrations
25. AI
26. Reliability engineering
27. Performance engineering
28. Caching
29. Security
30. Observability
31. Environments, CI/CD and releases
32. Testing
33. Disaster recovery
34. Code quality and dependencies
35. Git policy
36. How Claude must work on Runtruck
37. Feature template and definition of done
38. Worked example — Create Load
39. Development phases
40. Documentation hierarchy and source of truth
41. Open decisions
42. Glossary

---

## 1. Purpose and scope

Runtruck is a multi-tenant transportation management system (TMS) for trucking companies: asset
carriers, brokers, hybrids and private fleets. It serves dispatchers, drivers, accounting, safety,
HR, maintenance, managers and administrators.

It must support loads and stops, dispatch, the planner calendar, drivers, trucks, trailers,
carriers, customers and facilities, tracking, documents, invoicing, driver and carrier settlements,
payables, maintenance, safety and compliance, HR onboarding and contracts, notifications,
integrations, AI-assisted operations and reporting — for many companies on one platform, growing
from a ten-truck fleet to millions of records per tenant.

**Out of scope for this document:** product requirements (what each screen must do — see
`01-product-requirements.md`), pricing, and marketing content.

---

## 2. Where Runtruck is today

Verified against `main` @ `46217c7` on 2026-09-30. Every plan in this document starts from here.

### 2.1 What exists

| Area | Current state |
| --- | --- |
| Repository | Repo root is a Claude Design handoff bundle (`README.md`, `chats/`, `project/*.dc.html`). The real app is in `app/`. |
| Web app | React 19.2, React Router 7.18, Vite 8.3, TypeScript 6.0. Single-page app. `app/src`: 14 components, 23 pages/tabs, 6 data files, 4 helpers, 4 stylesheets. |
| Screens | Marketing landing page (`/`); app shell (`/app/*`) with Dashboard, Loads (+ detail, + New Load form), Planner (day/week/month calendar), Fleet (Drivers, Trucks, Trailers), CRM, Facilities (placeholder), Accounting (Uninvoiced, Invoiced, Batches, Past Due, Paid, Payroll, Bills), HR (Contracts, Onboarding), Safety (Maintenance, Driver Documents, Violations, Claim Settlements). Settings popup (Profile, dark mode), Log out. |
| Data | **All mock.** Static arrays in `src/data/*.ts`. Loads created with New Load live in React state (`AppShellContext`) and vanish on reload. Planner events, color codes and preferences, and the theme live in `localStorage` (`runtruck-planner-events`, `-categories`, `-prefs`, `runtruck-theme`). |
| Back end | **None.** No API, database, authentication, authorization or tenants. "Log out" only navigates to `/`. |
| Money, dates | Money stored as display strings (`'$2,450'`), dates as `'Sep 3'` without a year; the calendar assumes 2026. |
| Styling | Plain CSS: `shell.css` (app, `ui-*` classes, light/dark tokens), `calendar.css`, `industry.css` (design system, marketing site), `app.css`. |
| Build and deploy | `tsc -b && vite build`, deployed by Vercel from GitHub (`app/vercel.json`, SPA rewrite). Every branch gets a Vercel preview; `main` is production. |
| Bundle | One JavaScript file for the whole app and marketing site: ~345 KB uncompressed (~100 KB gzip); CSS ~23 KB. No code splitting. |
| Quality gates | Only the Vercel build. **No tests, no CI workflow, no lint in CI, no error boundaries.** `tsconfig` has `noUnused*` and `verbatimModuleSyntax` but **`strict` is off**. |
| Dev environment | The owner's machine has Git but no Node.js, so the Vercel build is currently the only compile check. |

### 2.2 What that means

The front end is a solid, well-organised **prototype**: the screens, the domain vocabulary and the
workflows (create load, dispatch, invoice, settle, plan) are real and worth keeping. Everything
behind the screens has to be built. The plan is therefore **evolutionary**: keep the React app,
harden it, then replace the mock data one domain at a time with a real API (§39), never a big-bang
rewrite.

---

## 3. Quality targets — what "runs smoothly" and "optimized" mean

"Runs smoothly no matter what" cannot be literally guaranteed by any system; it is turned into
measurable targets, and the architecture is designed so that failures degrade gracefully instead of
taking the product down. These targets are **requirements**: work that breaks them is not done.

### 3.1 Service levels

| Target | Value | Notes |
| --- | --- | --- |
| Availability (web and API) | **99.9 % monthly** (≤ 43 min downtime) | Measured by external synthetic checks. Raise to 99.95 % once there are paying customers at scale. |
| Data loss on disaster (RPO) | **≤ 5 minutes** | Managed Postgres point-in-time recovery. |
| Recovery time (RTO) | **≤ 1 hour** | Documented, rehearsed runbook (§33). |
| Deploy safety | Every production deploy can be rolled back in **≤ 5 minutes** | Vercel instant rollback (web); previous container image (API). |
| Background jobs | 99 % of jobs start within **30 s** of being queued | Notifications, documents, integrations. |

### 3.2 Performance budgets

Measured at the 75th percentile of real users (web) and 95th/99th percentile of requests (API).

| Target | Budget | Today |
| --- | --- | --- |
| Marketing page Largest Contentful Paint | ≤ 1.8 s | Not measured; marketing ships inside the app bundle. |
| App first load LCP | ≤ 2.5 s | Not measured. |
| Interaction to Next Paint (INP) | ≤ 200 ms | Not measured. |
| Cumulative Layout Shift | ≤ 0.1 | Not measured. |
| Initial JavaScript, app shell | ≤ 150 KB gzip | ~100 KB gzip, but contains every screen; will grow without splitting. |
| Per-route chunk | ≤ 60 KB gzip | No route chunks yet. |
| CSS total | ≤ 30 KB gzip | ~23 KB uncompressed. |
| API read, p95 / p99 | ≤ 200 ms / ≤ 800 ms | No API. |
| API write, p95 / p99 | ≤ 400 ms / ≤ 1.5 s | No API. |
| Database query, p95 | ≤ 20 ms | No database. |
| List endpoints | Paginated, ≤ 100 rows per page | — |
| Tables in the browser | Virtualized above 200 rows | — |

Budgets are enforced automatically in CI (bundle size, Lighthouse) and in production monitoring
(web vitals, API latency). See §27.

---

## 4. Architecture decisions

Each decision records what was chosen, why, and what was rejected. Changing an **Accepted**
decision requires a new decision record (`docs/adr/NNNN-title.md`) approved by the owner.

| # | Decision | Status | Why | Rejected alternatives |
| --- | --- | --- | --- | --- |
| D1 | **Keep React 19 + Vite + React Router 7 as a single-page app** for the logged-in product (`apps/web`). | Proposed | The app is behind a login, so it gains nothing from search-engine rendering. A static SPA served from a CDN is the cheapest, fastest and most reliable thing to host (no server to fall over), and all 23 existing screens keep working. React Router 7 can adopt server rendering later, route by route, if a real need appears. | **Next.js** (the example stack): a rewrite of routing and data loading for no user-visible gain; adds a server runtime that must itself be kept up. |
| D2 | **Serve the marketing site as prerendered static HTML** (`apps/site`, separate from the app bundle). | Proposed | The landing page is the only page that needs SEO and the fastest possible first paint, and it should not download the TMS code. | Leaving it inside the SPA (today): slower, not indexable. |
| D3 | **NestJS modular monolith** with the Fastify adapter (`apps/api`), one deployable, with domain modules. | Accepted | Clear module boundaries, dependency injection and guards suit permission-heavy business software; Fastify is the faster HTTP layer. One deployable keeps operations simple. | Microservices (operational cost with no current need); serverless functions for the whole API (cold starts, connection storms against Postgres, no long-lived workers). |
| D4 | **Workers run the same codebase as a separate process** (`apps/api` worker entry point). | Accepted | Shares domain code and validation; scales independently of HTTP traffic. | A separate worker service repository. |
| D5 | **PostgreSQL (managed, with point-in-time recovery and a connection pooler)** as the only source of truth; **Drizzle ORM** with SQL migrations. | Accepted | Relational data (loads ↔ stops ↔ invoices ↔ settlements), transactions for money, row-level security for tenants, JSONB where flexibility is needed. Drizzle is type-safe, thin and keeps SQL visible. | Document databases (no transactions across aggregates); heavier ORMs that hide SQL. |
| D6 | **Transactional outbox → BullMQ on Redis** for events and jobs. | Accepted | Events are written in the same database transaction as the change, so an event is never lost and never sent for a change that rolled back. Redis being down delays jobs; it never loses them. | Publishing straight to a queue from the request (lost events on crashes). |
| D7 | **S3-compatible object storage** for documents, with signed URLs. | Accepted | Cheap, durable, keeps binaries out of Postgres. | Files in Postgres. |
| D8 | **Session cookies (httpOnly, Secure, SameSite=Lax)** issued by the API; no tokens in `localStorage`. | Accepted | Immune to token theft by injected scripts; simplest correct model for a web app on one site. The mobile app uses the same session through secure device storage. | JWTs in `localStorage`. |
| D9 | **Authentication library:** a self-hosted TypeScript library with organization support (candidate: Better Auth), or a managed identity provider (candidates: WorkOS, Clerk). | Proposed — needs a one-week spike | Must support email/password, SSO for larger customers, MFA, organizations and invitations. Verify each candidate's actual features and pricing before choosing (§41). | Hand-written password and session code. |
| D10 | **Hosting:** web and marketing on **Vercel** (as today). API and workers on a **container platform with always-on processes** in the same region as the database. Managed Postgres and Redis. | Proposed | Keeps the working Vercel pipeline. The API needs persistent processes for workers, WebSockets and database connection pooling, which serverless functions do not provide well. Candidates to evaluate: AWS (ECS Fargate + RDS + ElastiCache), Render, Fly.io, Railway. | Everything on serverless functions. |
| D11 | **pnpm + Turborepo monorepo.** | Accepted | Shared types, validation and calculations between web, API and mobile; cached builds. | Separate repositories (types drift). |
| D12 | **Zod schemas shared** by web forms, API validation and AI tools (`packages/domain`). | Accepted | One definition of a valid load, used everywhere. | Duplicated validation. |
| D13 | **TanStack Query** for server state in web and mobile. | Accepted | Caching, retries, request de-duplication and background refresh for free; replaces ad-hoc React state for API data. | Global stores holding server data. |
| D14 | **REST + OpenAPI generated from the Zod schemas**; typed client generated for web and mobile. | Accepted | Simple, cacheable, tool-friendly; no hand-written API types. | GraphQL (more moving parts than needed now). |
| D15 | **WebSocket (or Server-Sent Events) channel** for live updates: dispatch board, tracking, notifications. | Accepted | Dispatchers should not poll. Redis pub/sub fans out across API instances. | Polling. |
| D16 | **React Native + Expo** driver app. | Accepted | Shares TypeScript, validation and the API client; over-the-air updates. | Separate native apps. |
| D17 | **OpenTelemetry** traces/metrics/logs + an error tracker (candidate: Sentry). | Accepted | Vendor-neutral instrumentation; one request ID from browser to database. | Ad-hoc logging. |
| D18 | **Trunk-based Git** (`main` + short-lived `feature/*`, `fix/*` branches, preview per branch, protected `main`). | Proposed | Matches how Runtruck is already developed (branch → Vercel preview → approval → `main`) with less ceremony than a `develop` branch. | Git-flow with a long-lived `develop` (the example). |

---

## 5. Core principles

These apply to every change.

1. **PostgreSQL is the source of truth.** Business data lives in Postgres. Browser state,
   `localStorage`, Redis, caches and AI context are never authoritative. (Today's `localStorage`
   planner data is a prototype stand-in and migrates to the database in Phase 5.)
2. **The back end owns business rules.** Authentication, authorization, tenant isolation,
   validation, state transitions, money and security are enforced by the API. The front end may
   *also* check (to give instant feedback), but never *only* checks.
3. **Every tenant-owned row carries `organization_id`, and isolation is enforced twice** — in the
   application's queries and by Postgres row-level security (§11).
4. **Never trust the client.** The organization, user, role and permissions come from the
   authenticated session, never from request bodies, headers or URLs.
5. **Money is integer cents** (`bigint`) with a currency code. Never floating point, never
   formatted strings in data.
6. **Time is `timestamptz` in UTC**, and appointment windows keep the facility's IANA time zone
   (§10.4). The browser converts for display.
7. **Every write is idempotent or protected against duplicates** (idempotency keys, unique
   constraints, optimistic concurrency).
8. **Nothing slow happens inside a request.** Anything that can take more than ~300 ms or depends
   on an outside service goes to a background job.
9. **Fail soft.** A broken integration, a slow report or a dead worker must not take down dispatch.
   Isolate failures (§26).
10. **Measure, don't guess.** Performance and reliability claims are backed by the budgets in §3.
11. **Simple over clever.** No microservices, no new infrastructure, no new dependency without a
    written reason (§34).
12. **TypeScript, strict, everywhere** — web, API, workers, mobile, scripts, tests.

---

## 6. System architecture

```
                         Users (office, drivers, customers later)
                                        │
            ┌───────────────────────────┼────────────────────────────┐
            │                           │                            │
   Marketing site (static)       Web app (React SPA)          Driver app (Expo)
   apps/site · CDN               apps/web · CDN               apps/mobile · app stores
            │                           │                            │
            └──────────── HTTPS (REST /api/v1 + WebSocket /ws) ──────┘
                                        │
                         ┌──────────────▼──────────────┐
                         │   API — NestJS (≥ 2 copies)  │
                         │  auth · tenant · permissions │
                         │  validation · domain modules │
                         │  outbox writer · audit log   │
                         └──────┬───────────────┬───────┘
                                │               │
                  ┌─────────────▼───┐      ┌────▼──────────────┐
                  │ PostgreSQL       │      │ Redis              │
                  │ (primary + PITR, │      │ queues · pub/sub · │
                  │  pooler, replica │      │ rate limits · cache│
                  │  later)          │      └────▲──────────────┘
                  └─────┬───────────┘           │
                        │ outbox relay          │
                        └──────────►  Workers (BullMQ, ≥ 2 copies)
                                         │
             ┌───────────────────────────┼─────────────────────────┐
             │                           │                         │
     Object storage (S3)          Email / SMS / push        External APIs
     documents, exports           providers                 ELD, load boards, mileage,
                                                            fuel cards, accounting,
                                                            factoring, EDI
```

### 6.1 Request path (a write)

```
Browser ─► CDN serves SPA once, then:
  POST /api/v1/loads  (session cookie, Idempotency-Key)
    ─► rate limiter (per user + per organization)
    ─► authenticate session          → 401 if not
    ─► resolve organization + roles  → from session, never from the body
    ─► permission guard (loads.create) → 403 if not
    ─► Zod validation                → 422 with field errors
    ─► service: business rules       → 409 on conflict
    ─► ONE database transaction:
         set tenant context (RLS) · insert load + stops + charges
         · insert audit_log · insert outbox_event(LoadCreated)
    ─► 201 { data, meta } with requestId
  Outbox relay (async) ─► BullMQ ─► workers: notifications, planner feed, integrations
  Redis pub/sub ─► WebSocket ─► other dispatchers' boards update live
```

---

## 7. Repository structure

### 7.1 Target layout

```
Runtruck1/
├── apps/
│   ├── web/            React SPA (today's app/, moved)
│   ├── site/           Static marketing site (today's LandingPage, prerendered)
│   ├── api/            NestJS API + worker entry point
│   └── mobile/         Expo driver app
├── packages/
│   ├── domain/         Zod schemas, types, enums, state machines, pure calculations
│   │                   (money, rates, margins, HOS, dates/time zones). No I/O.
│   ├── database/       Drizzle schema, migrations, seed (today's mock data → seed)
│   ├── api-client/     Generated typed client + TanStack Query hooks
│   ├── permissions/    Permission catalogue, role definitions, checks
│   ├── ui/             Shared React components + tokens (Card, Kpis, Tag, dialogs, shell.css)
│   ├── integrations/   Provider adapters (§24)
│   ├── config/         tsconfig, oxlint, Vitest, Playwright presets
│   └── observability/  OpenTelemetry + logging setup shared by api and workers
├── infrastructure/     Infrastructure as code, Docker, runbooks
├── docs/               This document and the detailed specifications (§40)
├── design/             Today's handoff bundle (project/, chats/) — reference only
├── CLAUDE.md           Short pointer: rules for AI agents, links to docs/
├── package.json · pnpm-workspace.yaml · turbo.json
└── .github/workflows/  CI (§31)
```

### 7.2 Migration from today's layout (Phase 1)

1. Move `app/` → `apps/web/` with `git mv` (history preserved); update Vercel's root directory.
2. Move `project/` and `chats/` → `design/`; replace the root `README.md` (the handoff
   instructions are obsolete) with a project README.
3. Extract `src/lib/dates.ts`, the money/rate maths in `NewLoadDialog.tsx`, and the planner layout
   algorithm into `packages/domain` with tests.
4. Move `Card`, `Kpis`, `Tag`, dialog shells and `shell.css` tokens into `packages/ui`.
5. Split `LandingPage` into `apps/site`.
6. Switch from npm (`package-lock.json`) to pnpm (`pnpm-lock.yaml`).

Each step is its own pull request with a passing preview; the live site keeps working throughout.

---

## 8. Web front end

### 8.1 Responsibilities

The web app displays information, collects input, and asks the API to act. It owns navigation,
forms, tables, boards, the calendar, maps, presentation state and user preferences' *display*.

It must **not**: enforce security or tenant boundaries, compute authoritative money (it may preview
totals, as the New Load form does, but the API recomputes and stores them), talk to the database,
or hold secret keys.

### 8.2 Structure (`apps/web/src`)

```
app/            Router, providers (QueryClient, theme, session), error boundaries
routes/         One folder per section: dashboard, loads, planner, fleet, crm,
                facilities, accounting, hr, safety, settings — each lazily loaded
features/       Feature components used by routes (new-load, event-dialog, …)
api/            Thin wrappers over packages/api-client (query keys, mutations)
state/          UI-only state (search box, table filters) — never server data
styles/         App styles (moving to packages/ui)
```

### 8.3 State — four kinds, four homes

| Kind | Example | Home |
| --- | --- | --- |
| Server data | loads, drivers, invoices | TanStack Query cache, fetched from the API. Never copied into React state or `localStorage`. |
| URL state | section, tab, selected load, calendar date and view, filters, sort | The URL (search params). Shareable, survives reload. Today tabs already are; filters and calendar date will be. |
| Ephemeral UI state | open dialog, form draft, hover | Component state. |
| Preferences | theme, calendar layout, card lines | API (`user_preferences`), cached in `localStorage` only as a fast-start copy. |

### 8.4 Performance rules

- **Code-split every route** with `React.lazy` + `Suspense` (§27.1). The marketing site leaves the
  bundle entirely (D2).
- **Prefetch** a route's chunk and first page of data on link hover or focus.
- **Virtualize** tables and lists above 200 rows; never render thousands of DOM rows.
- **Paginate on the server** (cursor-based); search and filtering happen in the API, not by
  downloading everything.
- **Memoize expensive derived data** (planner layout, KPI sums) with `useMemo`; keep components
  that re-render on every keystroke small.
- **Fonts:** self-host Inter and preload the two weights used above the fold (removes the Google
  Fonts round trip); `font-display: swap` stays.
- **Images and icons:** SVG inline or sprite; any raster image gets width/height and lazy loading.
- **No layout shift:** reserve space for async content (skeletons with fixed heights).

### 8.5 Reliability rules

- **Error boundaries** at the app root and around every route and dialog. One broken screen shows
  a "Something went wrong — Retry" card; the sidebar and other screens keep working. (Today a
  single render error blanks the whole app.)
- **Stale chunk recovery:** after a deploy, an old tab may request a chunk that no longer exists.
  Catch the chunk-load error and reload once.
- **Network resilience:** TanStack Query retries idempotent reads with backoff; mutations are not
  auto-retried unless they carry an idempotency key. An offline banner appears when the browser
  reports no connection; unsent form drafts are kept locally.
- **Optimistic updates** only for low-risk, reversible actions (toggling a legend chip, reordering);
  never for money or dispatch.

### 8.6 Design system and accessibility

- Tokens (`--ui-*`) and components live in `packages/ui`; light and dark themes are token swaps
  (as today). New screens use existing components before inventing new ones.
- WCAG 2.2 AA: 4.5:1 text contrast in both themes, visible focus, keyboard access to every
  action, dialogs via native `<dialog>` (as Settings, New Load and the planner already do), form
  errors announced to screen readers.

---

## 9. API back end

### 9.1 Module layout (`apps/api/src`)

```
common/          request context, errors, guards, interceptors, pagination, idempotency
auth/  organizations/  users/  roles/  preferences/
customers/  facilities/  carriers/  drivers/  trucks/  trailers/
loads/  stops/  dispatch/  tracking/  planner/
documents/  notifications/  messaging/
invoices/  payments/  settlements/  payables/          (bills)
maintenance/  compliance/  violations/  claims/  hr/
integrations/  ai/  audit/  outbox/  reporting/
worker.ts        worker entry point (processes queues)
main.ts          HTTP entry point
```

Every domain module has the same shape:

```
loads/
├── loads.module.ts
├── loads.controller.ts     HTTP only: parse, call service, shape response
├── loads.service.ts        business rules, transactions, events
├── loads.repository.ts     Drizzle queries, always tenant-scoped
├── loads.policy.ts         who may do what to which load
├── loads.events.ts         event names and payload schemas
└── loads.spec.ts / tests/
```

Schemas and state machines come from `packages/domain`, so the web form and the API validate the
same way.

### 9.2 Layer rules

- Controllers never touch the database. Repositories never contain business rules. Services never
  know about HTTP.
- Modules talk to each other through services or events, never by importing another module's
  repository.
- One HTTP request = at most one write transaction. Cross-module side effects happen through
  outbox events.

---

## 10. Data architecture

### 10.1 Conventions

| Topic | Rule |
| --- | --- |
| Primary keys | `id uuid` — **UUIDv7** (time-ordered, index-friendly). Never exposed sequential IDs. |
| Business numbers | Human-facing numbers are separate columns with per-organization sequences: `load_number` (`L-40218`), `invoice_number` (`INV-8845`), `batch_number`, `claim_number`. Unique per organization. |
| Tenant column | `organization_id uuid not null` on every tenant-owned table, first column of most indexes. |
| Timestamps | `created_at`, `updated_at timestamptz not null default now()`; `created_by`, `updated_by` user IDs where useful. |
| Concurrency | `version integer` on editable aggregates (load, invoice, settlement); updates require the version the client read (§14.6). |
| Money | `*_cents bigint` + `currency char(3)` (default `USD`). Rates per mile as `numeric(10,4)`. |
| Quantities | Weight `integer` pounds; distance `numeric(10,1)` miles; temperature `numeric(5,1)` °F. |
| Enums | Postgres enums or check constraints for statuses, mirrored as Zod enums in `packages/domain`. |
| Deletion | Business records are **archived** (`archived_at`), not deleted, when anything references them (loads, invoices, drivers). Hard deletes only for drafts and personal data under a retention policy. |
| Naming | `snake_case`, plural table names, foreign keys `<entity>_id`. |

### 10.2 Core schema (derived from today's screens)

```
Tenancy & access    organizations, users, memberships (user ↔ organization + roles),
                    roles, role_permissions, invitations, sessions, user_preferences
Partners            customers, customer_contacts, facilities (shippers/receivers/yards/shops),
                    carriers (partner carriers: MC, DOT, insurance, W-9)
Fleet               drivers, trucks, trailers, equipment_assignments (who drives what, when)
Loads               loads, load_stops, load_charges (line haul, fuel, accessorials),
                    load_ltl_details, load_references (PO, tender, pickup/delivery #),
                    dispatches (load ↔ driver/truck/trailer or carrier, with history),
                    load_status_history
Tracking            location_pings (partitioned by month), eta_snapshots
Planner             calendar_events, calendar_color_codes
Documents           documents, document_versions
Money in            invoices, invoice_lines, invoice_batches, payments, payment_allocations
Money out           settlements, settlement_lines, deductions, payables (bills), payable_payments
Maintenance         work_orders, service_intervals
Safety & compliance driver_qualification_documents, inspections, violations, claims, claim_payments
HR                  employee_contracts, onboarding_cases, onboarding_steps
Platform            audit_logs (append-only), outbox_events, idempotency_keys,
                    notifications, notification_deliveries, integration_accounts,
                    integration_sync_runs, feature_flags
```

The full column-level specification is `03-database.md`; this document only fixes the conventions
and the entity list. **Claude must not create tables or columns that contradict `03-database.md`**;
if it is missing something, propose the change there first.

### 10.3 Mapping today's mock data

| Mock file | Becomes |
| --- | --- |
| `mock.ts` `LOADS`, `CARRIERS`, `DRIVERS`, `TRUCKS`, `TRAILERS`, `CUSTOMERS`, `INVOICES`, `SETTLEMENTS`, `USER` | `loads` + `load_stops` + `load_charges` + `dispatches`, `carriers`, `drivers`, `trucks`, `trailers`, `customers`, `invoices`, `settlements`, `users` |
| `accounting.ts` `UNINVOICED`, `BATCHES`, `BILLS`, `PAYMENTS` | derived view "delivered, not invoiced", `invoice_batches`, `payables`, `payments` |
| `safety.ts` | `work_orders`, `driver_qualification_documents`, `violations`, `claims` |
| `hr.ts` | `employee_contracts`, `onboarding_cases` |
| `planner.ts` `PLANNER_EVENTS`, `DEFAULT_CATEGORIES` | `calendar_events`, `calendar_color_codes` |
| `localStorage` planner/theme keys | `user_preferences` (layout, theme, card lines), `calendar_color_codes` |

All of it becomes the **development seed** (`packages/database/seed`), so every developer and every
preview environment starts with the same realistic Sunridge Freight data the prototype shows.

### 10.4 Time zones for appointments

A 08:00–14:00 pickup window at a facility in Fresno means 08:00 *Fresno time*, whoever is looking.
So `load_stops` stores `window_start_local`, `window_end_local` (date + time without zone) **and**
the facility's `time_zone` (IANA, e.g. `America/Los_Angeles`), plus the computed UTC instants
`window_start_at`, `window_end_at` for sorting and alerts. Everything else is plain UTC.

### 10.5 Indexing and scale

- Every foreign key and every column used in a `WHERE`/`ORDER BY` of a list endpoint is indexed,
  with `organization_id` leading: e.g. `loads (organization_id, status, pickup_at)`.
- Text search: Postgres full-text (`tsvector`) plus trigram indexes on names and numbers for the
  top-bar search.
- High-volume append tables (`location_pings`, `audit_logs`, `outbox_events`) are **partitioned by
  month** and have a retention policy.
- `pg_stat_statements` is on; any query over 50 ms p95 in staging gets a ticket.
- Read replica added when reporting load justifies it; reports read from it, never the primary.

### 10.6 Migrations

- Drizzle SQL migrations, reviewed like code, applied by CI before the new API version starts.
- **Expand → migrate → contract:** add columns/tables first (backward-compatible), deploy code that
  writes both, backfill in batches in a job, switch reads, remove the old column in a later
  release. No migration may lock a large table or break the running version.
- Every migration is tested against a copy of production-sized data in staging before production.

---

## 11. Multi-tenancy

The tenant is the **organization** (a trucking company). A user can belong to several
organizations (a consultant, an accountant) and picks one after login; the session then carries
exactly one active `organization_id`.

Isolation is enforced in **two independent layers**, so a single bug cannot leak data:

1. **Application layer** — every repository method takes the request context and adds
   `organization_id = ctx.organizationId` to every query. There is no repository method without it.
2. **Database layer — Postgres row-level security.** Every tenant-owned table has a policy
   `organization_id = current_setting('app.organization_id')::uuid`. The API connects as a role
   *without* `BYPASSRLS` and runs `SET LOCAL app.organization_id = …` at the start of every
   transaction. A query that forgets the filter returns nothing instead of another company's rows.

Rules:
- The organization comes from the session only. An `organization_id` in a request body or URL is
  ignored or rejected.
- Cross-organization features (a broker sharing a load with a partner carrier) are explicit share
  records with their own permissions, never a relaxed policy.
- Background jobs carry `organization_id` in their payload and set the same database context.
- Platform-admin tools use a separate, audited database role and are not reachable from the
  tenant API.
- An automated **tenant isolation test suite** (§32) calls every endpoint as organization B
  against organization A's IDs and must get 404 every time.

---

## 12. Authentication

Authentication answers *who is this?*; authorization answers *what may they do?* They stay separate.

- Email + password (hashed with a modern memory-hard algorithm by the chosen library), email
  verification, password reset; MFA (TOTP / passkeys) available to all and **required for Owner,
  Admin and Accounting roles**; SSO (SAML/OIDC) for larger customers.
- Sessions: server-side session records, httpOnly Secure SameSite=Lax cookie, 12-hour idle timeout,
  30-day absolute timeout, rotation on privilege change, revoke-all on password change.
- "Log out" revokes the session server-side, then returns to the marketing site (today it only
  navigates).
- CSRF protection on every state-changing request (SameSite plus a double-submit token).
- Login and reset endpoints are rate-limited per IP and per account; lockout with backoff.
- The request context produced by authentication contains at least `userId`, `organizationId`,
  `roles`, `permissions` (resolved), `sessionId`, `requestId`.

---

## 13. Authorization, roles and permissions

Every protected operation checks, in order:

```
authenticated? → active membership in this organization? → has permission?
→ record belongs to the organization (RLS + query)? → business rule allows it? → do it + audit
```

### 13.1 Permission catalogue (from today's sections)

```
loads.view  loads.create  loads.update  loads.cancel  loads.delete_draft
dispatch.assign  dispatch.unassign  dispatch.override_warnings
planner.view  planner.manage_events  planner.manage_color_codes
fleet.drivers.view/manage  fleet.trucks.view/manage  fleet.trailers.view/manage
crm.customers.view/manage  facilities.view/manage  carriers.view/manage
documents.view  documents.upload  documents.delete
accounting.invoices.view/create/send/void  accounting.payments.record
accounting.settlements.view/create/approve  accounting.payables.view/manage/pay
safety.maintenance.view/manage  safety.compliance.view/manage
safety.drug_alcohol.view            (restricted — see §20)
safety.claims.view/manage
hr.contracts.view/manage  hr.onboarding.view/manage
reports.view  settings.organization  users.manage  roles.manage  audit.view
integrations.manage  ai.use
```

### 13.2 Default roles

| Role | Summary |
| --- | --- |
| Owner | Everything, including billing of the Runtruck subscription and deleting the organization. |
| Admin | Everything except organization deletion and subscription billing. |
| Dispatcher | Loads, dispatch, planner, fleet (view + availability), customers, documents. No money approval. |
| Accounting | Invoices, payments, settlements, payables, customers (billing fields), reports. |
| Safety manager | Maintenance, compliance, drug & alcohol, violations, claims, driver files. |
| HR | Contracts, onboarding, driver files (non-medical). |
| Maintenance | Work orders, trucks, trailers. |
| Driver | Mobile app only: own assigned loads, own documents, own settlements. |
| Viewer | Read-only across operational screens; no money or personal data. |

Organizations can create custom roles from the catalogue. The web app hides what the user cannot do
(from the session's resolved permissions), and the API refuses it regardless.

---

## 14. API conventions

### 14.1 Shape

```
GET    /api/v1/loads?status=in_transit&cursor=…&limit=50&sort=-pickup_at
GET    /api/v1/loads/:id
POST   /api/v1/loads
PATCH  /api/v1/loads/:id                      (If-Match: version)
POST   /api/v1/loads/:id/dispatch             (actions are verbs on the resource)
POST   /api/v1/loads/:id/status               { to: "at_pickup" }
POST   /api/v1/loads/:id/cancel
GET    /api/v1/planner/events?from=…&to=…     (office events + load stops in range)
```

Load numbers are accepted where humans type them: `GET /api/v1/loads/by-number/L-40218`.

### 14.2 Responses

```json
{ "data": { }, "meta": { "requestId": "req_…", "nextCursor": "…" } }
```

```json
{ "error": { "code": "LOAD_NOT_FOUND", "message": "Load was not found.",
             "fields": { "stops[1].date": "Must be after stop 1" }, "requestId": "req_…" } }
```

### 14.3 Error codes and HTTP status

`VALIDATION_ERROR` 422 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `NOT_FOUND` 404 (also used for
other tenants' records — never 403, which would confirm they exist) · `CONFLICT` 409 (version
mismatch, invalid state transition, duplicate) · `RATE_LIMITED` 429 with `Retry-After` ·
`INTEGRATION_ERROR` 502 · `UNAVAILABLE` 503 with `Retry-After` · `INTERNAL_ERROR` 500. Internal
details, stack traces and SQL never reach the client; they go to logs under the `requestId`.

### 14.4 Pagination, filtering, sorting

Cursor pagination (opaque cursor over the sort key + `id`), default 50, maximum 100. Totals are
returned only where cheap or explicitly requested. Filters and sorts are whitelisted per endpoint.

### 14.5 Idempotency

Every `POST` that creates something or moves money accepts an `Idempotency-Key` header. The API
stores key + request hash + response for 24 hours per organization; a retry returns the original
response instead of creating a duplicate load or invoice. The web client sends one automatically.

### 14.6 Optimistic concurrency

Editable aggregates return `version` (and an `ETag`). Updates send `If-Match`; if someone else
changed the load meanwhile the API returns 409 and the UI offers to reload and re-apply.

### 14.7 Versioning

`/api/v1` is stable. Additive changes (new fields, new endpoints) are allowed; removing or changing
the meaning of a field requires `/api/v2` or a documented deprecation period, because installed
mobile apps cannot be updated instantly.

---

## 15. Validation

Zod schemas in `packages/domain` validate: web forms (the New Load form's required-field logic
moves here), API bodies, query strings and route parameters, file metadata, job payloads, data
returned by integrations, AI tool inputs and outputs, and environment variables at startup (the
process refuses to start with invalid configuration). External data is never assumed valid.

---

## 16. Load domain and state machines

### 16.1 The load aggregate

```
Load (load_number, customer, bill-to, mode FTL/LTL/Partial, equipment, references)
├── Stops (ordered; pickup/delivery; facility; appointment window + time zone; numbers)
├── Freight (commodity, weight, pieces, packaging, value, temperature, hazmat/UN)
├── LTL details (class, NMFC, handling units, dimensions, services)
├── Charges (line haul, fuel surcharge, accessorials) → customer total
├── Dispatch (own driver + truck + trailer, or partner carrier + carrier rate) with history
├── Documents (rate con, tender, BOL, POD, lumper receipt)
├── Status (state machine below) + exception flags (delayed, on hold, …)
└── Audit trail and status history
```

### 16.2 Status machine

```
DRAFT ──► BOOKED ──► DISPATCHED ──► AT_PICKUP ──► LOADED ──► IN_TRANSIT ──► AT_DELIVERY ──► DELIVERED
  │          │            │             │                                                      │
  └──────────┴────────────┴─────────────┴──► CANCELLED (reason, TONU charge optional)          ▼
                                                                          READY_TO_BILL ──► INVOICED ──► PAID
```

| Today's UI label | Canonical status / flag |
| --- | --- |
| Needs driver | `BOOKED` with no active dispatch (derived label) |
| Dispatched | `DISPATCHED` |
| At pickup | `AT_PICKUP` |
| In transit | `LOADED` / `IN_TRANSIT` |
| Delayed | **Not a status** — an exception flag (`is_delayed` with reason) on any in-motion status |
| Needs POD | `DELIVERED` without an attached POD (derived label) |
| Delivered | `DELIVERED` / `READY_TO_BILL` |

Every transition is defined once in `packages/domain` with: allowed previous statuses, required
permission, required data (e.g. `READY_TO_BILL` requires a POD; `DISPATCHED` requires a driver or
carrier), side effects (events), and whether it can be reversed and by whom. The API rejects
anything else with 409. Backward moves (`DELIVERED → IN_TRANSIT` to fix a mistake) are separate,
audited correction actions requiring a stronger permission; `PAID` never goes back through normal
actions.

Invoices, settlements, payables, work orders, claims and onboarding cases get the same treatment in
their lifecycle documents (§40).

---

## 17. Dispatch

Assigning a load checks, **on the server, inside the dispatch transaction**:

- Driver active, not on home time, qualified (CDL, medical card, MVR, drug & alcohol status not
  expired — today's Safety › Driver Documents data), available hours of service for the planned
  duration (from the ELD integration when connected; otherwise dispatcher-entered).
- Truck and trailer in service (not in shop, not overdue for DOT inspection — today's Maintenance
  data), equipment type and length match the load (reefer for reefer freight, flatbed, …).
- No overlapping dispatch for the same driver/truck/trailer (enforced with an exclusion constraint
  on time ranges, so two dispatchers cannot double-book at the same moment).
- For partner carriers: active authority and insurance on file, carrier rate entered.

Checks return **blocking errors** or **warnings**; warnings can be overridden only with
`dispatch.override_warnings`, and the override and its reason are audited. The dispatch board and
planner update live for everyone (§23).

---

## 18. Planner (calendar)

Today the planner combines load stops with office events, lets users define color codes and card
lines, and stores everything in `localStorage`. In the production design:

- **Load stops are never copied into calendar events.** `GET /planner/events?from&to` returns
  office events from `calendar_events` **plus** stop appointments read from `load_stops` for the
  range, so the calendar can never disagree with the load board.
- **Color codes** (`calendar_color_codes`) are **organization-level** (the whole dispatch team shares
  what amber means), managed with `planner.manage_color_codes`. The two load-board codes (loaded /
  empty) remain undeletable, as today. *(Decision O5 — confirm.)*
- **Personal display preferences** (view, week start, weekends, hours, density, 12/24 h, hidden
  codes, card lines, color-by mode) live in `user_preferences`, per user.
- Range queries are indexed on `(organization_id, starts_at)`; a month view is one request.
- Drag-to-reschedule (future) goes through the same state and dispatch checks as any other edit.

---

## 19. Billing, settlements and payables

- **Invoices** are generated from loads in `READY_TO_BILL`; totals are computed by the API from
  `load_charges`, stored in cents, and immutable once sent (corrections are credit notes or voids,
  never edits). Invoice numbers are sequential per organization without gaps (allocated inside the
  transaction).
- **Batches** group invoices for a customer or a factoring company; sending a batch is a job
  (PDF rendering, email or factoring API), tracked per invoice.
- **Payments** are allocated to invoices; aging buckets (current, 1–30, 31–60, 60+) are computed by
  the database from due dates, not stored.
- **Settlements** (driver and carrier pay) are generated per pay period from delivered loads and
  pay rules (per mile, percentage of line haul, flat), minus deductions; states
  `DRAFT → APPROVED → PAID`, approval requires `accounting.settlements.approve`, and approved
  settlements are immutable.
- **Payables** (bills: fuel, tires, insurance, leases, repairs) have due dates, scheduled payment
  and link to work orders where relevant.
- Every money calculation lives in `packages/domain` as a pure, unit-tested function and is
  recomputed server-side; the browser's numbers are previews only.
- Money actions (approve, pay, void) are **sensitive**: MFA-protected roles, audit entries, and
  never executable by AI without human confirmation (§25).

---

## 20. Fleet, safety, HR and compliance data

This data includes personal and regulated information: driver licence details, medical cards,
MVRs, drug and alcohol test results and Clearinghouse queries, employment contracts, pay.

- Access is permission-gated per category; **drug and alcohol records are restricted** to
  `safety.drug_alcohol.view` and every read is audited. Confirm the exact regulatory obligations
  (e.g. FMCSA driver-qualification and drug-and-alcohol recordkeeping rules) with counsel before
  building this module.
- Sensitive identifiers (licence numbers, SSN/TIN for 1099 carriers and owner-operators) are
  encrypted at the column level with keys held in the secrets manager, masked in the UI by default.
- Expiry-driven data (CDL, medical card, annual review, insurance, DOT inspection) produces
  reminders through scheduled jobs, and feeds dispatch checks (§17).

---

## 21. Documents

- Binaries go to object storage; Postgres keeps metadata: `organization_id`, owner entity
  (`load_id`, `driver_id`, …), `document_type`, file name, `storage_key`, MIME type, size,
  checksum, `uploaded_by`, timestamps, current version.
- Uploads go **directly from the browser/app to storage** with a short-lived pre-signed URL issued
  after a permission check; the API never streams large files. Downloads use short-lived signed
  URLs too.
- After upload, a job verifies type and size, scans for malware, creates thumbnails/previews, and
  (later) extracts data from rate confirmations and PODs with OCR/AI.
- Storage keys are namespaced by organization (`org/<id>/…`), buckets are private, and versions are
  kept (deletes are soft and retained per policy).

---

## 22. Events, outbox and background jobs

### 22.1 Domain events

`LoadCreated`, `LoadUpdated`, `LoadDispatched`, `LoadStatusChanged`, `StopArrived`, `StopDeparted`,
`LoadDelivered`, `DocumentUploaded`, `PodReceived`, `InvoiceCreated`, `InvoiceSent`,
`PaymentRecorded`, `SettlementApproved`, `PayableDue`, `DriverDocumentExpiring`,
`WorkOrderDue`, `CalendarEventChanged`, …

Each event has a versioned schema, `organization_id`, the actor, the aggregate ID and version, and
a unique `event_id`.

### 22.2 Transactional outbox

```
Service transaction:  change rows + INSERT outbox_events(…)  → COMMIT
Outbox relay (worker): SELECT … FOR UPDATE SKIP LOCKED (batch) → enqueue in BullMQ → mark sent
Consumers:            idempotent — processed (event_id, consumer) is recorded; replays are no-ops
```

If Redis or the workers are down, events wait safely in Postgres and flow when they recover.

### 22.3 Queues

Separate queues so one slow thing cannot starve another (bulkheads):
`notifications`, `email`, `sms`, `push`, `documents`, `invoices`, `settlements`, `tracking`,
`integrations-<provider>`, `ai`, `reports`, `scheduled` (reminders, aging, expiry scans).

Every job: typed Zod payload, timeout, retries with exponential backoff and jitter, a dead-letter
queue after the final attempt with an alert, structured logs with `requestId`/`event_id`, and
idempotency. Long jobs report progress (e.g. "invoicing 11 loads: 7/11") that the UI can poll or
receive live.

---

## 23. Notifications and real-time updates

- Channels: in-app (stored in `notifications`), push (driver app), email, SMS. Per-user channel
  preferences; quiet hours; digests for low-priority events.
- Always created by workers from events — never inside the originating request.
- **Live updates:** the API publishes lightweight change messages (`load L-40218 changed,
  version 7`) to Redis pub/sub; each API instance forwards them over the WebSocket to subscribed
  browsers of the same organization; the browser invalidates the matching TanStack Query cache and
  refetches. Messages carry IDs, not data, so permissions are re-checked on refetch.
- If the socket drops, the client reconnects with backoff and refetches on focus; nothing depends on
  every message arriving.

---

## 24. Integrations

Every provider sits behind an adapter implementing a Runtruck interface, so providers can be
swapped and the domain never contains provider-specific code:

| Capability | Interface | Candidate providers (verify APIs before building) |
| --- | --- | --- |
| Tracking / ELD / HOS | `TelematicsProvider` | Samsara, Motive, Geotab |
| Mileage and routing | `RoutingProvider` | PC*MILER, Trimble, HERE |
| Load boards | `LoadBoardProvider` | DAT, Truckstop |
| Fuel cards | `FuelCardProvider` | WEX, Comdata, EFS |
| Accounting export | `AccountingProvider` | QuickBooks Online, Xero |
| Factoring | `FactoringProvider` | per factoring partner |
| EDI (204/214/210/990) | `EdiProvider` | an EDI VAN or provider |
| Messaging | `SmsProvider`, `EmailProvider`, `PushProvider` | Twilio, Postmark/SES, Expo push |

Rules: credentials per organization in `integration_accounts`, encrypted; all calls from workers
with timeouts, retries, rate-limit awareness and a **circuit breaker** (after repeated failures the
adapter stops calling for a cool-down and the UI shows "Samsara sync paused" instead of hanging);
webhooks verified by signature and processed idempotently; every sync run recorded. Never assume an
integration works until it has been tested against the provider's sandbox.

---

## 25. AI

AI is **another client of the API**, never a shortcut around it.

```
AI assistant → tool (typed, Zod-validated) → API service → authorization → tenant-scoped database
```

- No direct database access, no raw SQL, no access to other organizations, no secrets in prompts.
- Tools are classified: **Read** (find available drivers, get load, revenue by lane — run
  automatically), **Suggest** (draft a load from a rate confirmation, propose a driver — shown for
  approval), **Write** (create a draft load, add a calendar event — runs with the user's permissions
  and is labelled as AI-initiated in the audit log), **Sensitive** (approve a settlement, send
  payment, cancel a load, change settings — always requires explicit human confirmation in the UI).
- AI output that becomes data is validated with the same schemas as human input.
- Model and provider sit behind an adapter; prompts and tool definitions are versioned; usage is
  metered per organization.

---

## 26. Reliability engineering

This section is how the §3 targets are met.

### 26.1 Redundancy and isolation

- Web and marketing are static files on a global CDN: no servers to fail, cached at the edge.
- At least **two API instances and two worker instances**, in separate availability zones where the
  platform allows, behind a load balancer with health checks.
- Managed Postgres with automated failover (standby replica) and point-in-time recovery; managed
  Redis with persistence.
- Separate queues per workload (§22.3) and separate database connection pools for HTTP and workers,
  so a burst of background work cannot starve user requests.

### 26.2 Health, timeouts and back-pressure

- `GET /health/live` (process up) and `GET /health/ready` (database reachable, migrations current);
  instances that are not ready receive no traffic.
- Timeouts everywhere: HTTP request 10 s, database `statement_timeout` 5 s (reports run on the
  replica with a longer limit), outbound HTTP 5–15 s per provider. Nothing waits forever.
- Rate limiting per user and per organization (Redis token bucket); one noisy tenant cannot degrade
  others.
- Graceful shutdown: stop accepting requests, finish in-flight ones, let workers finish or requeue
  their current job.

### 26.3 Graceful degradation

| Failure | Behaviour |
| --- | --- |
| Redis down | API keeps serving reads and writes; events accumulate in the outbox; rate limiting fails open with conservative in-memory limits; live updates pause (clients refetch on focus). |
| Workers down | Same as above; alerts fire when the oldest unsent outbox event is older than 2 minutes. |
| An integration down | Circuit breaker opens; that sync shows as paused; everything else unaffected. |
| Database primary failure | Managed failover (typically under a minute); API retries safe reads; writes return 503 with `Retry-After` and the UI retries idempotent calls automatically. |
| A bad deploy | Health checks stop the rollout; one-click rollback (§31). |
| A browser-side crash | Route-level error boundary; rest of the app keeps working (§8.5). |

A **read-only maintenance mode** flag lets operators keep the product viewable during risky
maintenance.

### 26.4 Safe change

- Feature flags (`feature_flags` table, per organization) for every non-trivial feature, so new
  work ships dark and is enabled per tenant; flags are removed once fully rolled out.
- Backward-compatible API and database changes only (§10.6, §14.7).
- Preview environment for every branch (already the case for the web app).
- Post-deploy smoke test runs automatically; failure triggers rollback.

### 26.5 Incidents

Severity levels, an on-call owner, a status page, and a blameless post-incident review for every
SEV-1/SEV-2 with action items tracked to completion. Quarterly **game days** rehearse a database
restore, a Redis outage and a provider outage in staging.

---

## 27. Performance engineering

### 27.1 Front end

- Route-level code splitting (every section and every large dialog — New Load, Customize,
  Settings — lazy-loaded); the marketing site out of the app bundle (D2).
- Hashed static assets served with `Cache-Control: public, max-age=31536000, immutable`;
  `index.html` with `no-cache` (configured in `vercel.json`).
- Brotli compression (default on the CDN), HTTP/2+, `preconnect` to the API origin.
- **CI enforcement:** a bundle-size check fails any PR that exceeds the §3.2 budgets; Lighthouse CI
  runs against the preview deployment for the marketing page, login, dashboard, loads and planner.
- Real-user monitoring of Core Web Vitals per route, alerting on budget breaches.

### 27.2 API and database

- No N+1 queries: repositories load aggregates with joins or batched `IN` queries; a test helper
  counts queries per request in integration tests and fails when a list endpoint's query count
  grows with page size.
- Select only needed columns; list endpoints use narrow list DTOs, detail endpoints the full
  aggregate.
- Connection pooling (transaction mode) sized to the database's limits; pool usage is monitored.
- Anything slow is a job with progress (bulk invoicing, settlements for a pay period, exports,
  imports, reports).
- Load testing with k6 in staging before each major release: 3× the expected peak of the largest
  tenant, with the §3.2 latency targets as pass/fail thresholds.

---

## 28. Caching

| Layer | What | Invalidation |
| --- | --- | --- |
| CDN | Static assets (immutable), marketing HTML | New deploy. |
| Browser (TanStack Query) | API responses, per query key; `staleTime` tuned per resource (reference data minutes, boards seconds) | Mutations invalidate affected keys; WebSocket change messages invalidate by ID. |
| HTTP | `ETag` on GETs of aggregates → 304 when unchanged | Version change. |
| Redis | Short-lived: resolved permissions per session, reference lists, provider responses (e.g. mileage lookups, with provider-permitted TTLs) | TTL + explicit delete on change. |

Redis never holds the only copy of anything. Caches are always safe to flush.

---

## 29. Security

- OWASP ASVS level 2 as the checklist for the API and web app.
- HTTP security headers from `vercel.json` and the API: `Content-Security-Policy` (self + API
  origin + approved providers; no inline scripts except the hashed theme bootstrap in `index.html`),
  `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `frame-ancestors 'none'`.
- CORS: only Runtruck's own origins; credentials only for them.
- Secrets never in Git, never in the browser bundle, never in logs: environment variables from the
  platform's secrets manager; `.env*` files git-ignored; a secret scanner in CI and GitHub push
  protection enabled.
- Encryption in transit (TLS everywhere, including to the database) and at rest (managed storage),
  plus column-level encryption for the identifiers in §20.
- Dependency and container scanning in CI (e.g. `pnpm audit`, GitHub Dependabot/CodeQL); critical
  vulnerabilities block release.
- File uploads: type allow-list, size limits, malware scan, served with `Content-Disposition` from
  a separate storage domain.
- Audit logging (§30.2) for authentication, permission changes, money, dispatch and data exports.
- Least privilege for every machine credential; separate database roles for API, workers,
  migrations and platform admin.
- Annual third-party penetration test once customers are live; a `security.txt` and a
  vulnerability-disclosure address.

---

## 30. Observability

### 30.1 Signals

- **Traces** (OpenTelemetry) from browser request → API → database/Redis/provider → job, joined by
  `requestId`/trace ID.
- **Metrics:** request rate, errors, latency (p50/p95/p99) per endpoint; queue depth, job age and
  failures per queue; oldest unsent outbox event; database CPU, connections, slow queries,
  replication lag; cache hit rate; integration success rate per provider; web vitals per route.
- **Logs:** structured JSON, one line per event, with `requestId`, `organizationId`, `userId` —
  never passwords, tokens, full card or bank numbers, or document contents.
- **Errors:** front-end and back-end exceptions to the error tracker with release version and
  source maps.

### 30.2 Audit log

Append-only `audit_logs`: actor (user, AI on behalf of user, system), action (`LOAD_DISPATCHED`),
entity type and ID, before/after of changed fields, IP and user agent, `requestId`, timestamp. The
application role can insert but not update or delete. Viewable in the app with `audit.view`.

### 30.3 Alerts

Page a human for: availability SLO burn rate, API p95 above budget for 10 minutes, 5xx above 1 %,
oldest outbox event > 2 minutes, dead-letter jobs, database failover, backup failure, certificate
expiry within 14 days. Everything else goes to a daily digest.

---

## 31. Environments, CI/CD and releases

### 31.1 Environments

| Environment | Purpose | Data |
| --- | --- | --- |
| Local | Development | Docker Compose: Postgres, Redis, MinIO (S3); seeded with the Sunridge Freight demo data. |
| Preview | One per branch/PR (Vercel for web; ephemeral API optional later) | Seed data. |
| Staging | Production-like; release candidate testing, load tests, restore drills | Seed + anonymized production-shaped volume. Never real customer data. |
| Production | Customers | Real. |

Production credentials are never used outside production. Destructive operations (migrations that
drop, bulk deletes) run in staging first and need explicit approval for production.

### 31.2 Pipeline (GitHub Actions)

```
On every pull request:
  pnpm install --frozen-lockfile
  → oxlint → typecheck (all packages, strict) → unit tests → build
  → integration tests (Postgres + Redis containers) → tenant-isolation suite
  → bundle-size budget → migration check (apply to empty + previous schema)
  → deploy preview → end-to-end tests + Lighthouse against the preview
On merge to main:
  → same checks → build API image once → migrate staging → deploy staging → smoke tests
  → promote the same artifacts to production (migrations first, then API, then web)
  → post-deploy smoke tests → automatic rollback on failure
```

`main` is protected: pull request required, all checks green, at least one approval (the owner's
approval satisfies this today; Claude never merges without it).

### 31.3 Local tooling note

The owner's current machine has no Node.js, so today the Vercel build is the only compile check.
Installing Node LTS + pnpm (or using GitHub Codespaces) is part of Phase 0 so that tests and type
checks can run before pushing.

---

## 32. Testing

| Level | Tool | Covers | Target |
| --- | --- | --- | --- |
| Unit | Vitest | `packages/domain`: money, rates, margins, HOS, state machines, dates and time zones, planner layout, validation schemas | ≥ 90 % lines in `packages/domain` |
| Component | Vitest + Testing Library | Forms (New Load validation and totals), tables, dialogs, error states | Critical components |
| API integration | Vitest + Testcontainers (real Postgres, Redis) | Every endpoint: happy path, validation, permissions, 404 for other tenants, conflict | Every endpoint |
| Tenant isolation | Generated suite | Every endpoint called as org B with org A's IDs → 404; RLS verified with a raw query | 100 % of endpoints |
| Contract | OpenAPI diff | No breaking change to `/api/v1` without a version bump | Every PR |
| End-to-end | Playwright | Critical journeys (below) against the preview | Every PR |
| Load | k6 | §27.2 | Before major releases |
| Accessibility | axe in Playwright | Every page in both themes | Every PR |

Critical journeys that must always pass:

1. Log in → switch organization → log out.
2. Create a load with two stops (New Load form) → it appears on the board, the load page and the
   planner.
3. Dispatch it to an available driver/truck/trailer; attempt to dispatch an expired-CDL driver →
   blocked.
4. Driver app: accept → arrive → load → deliver → upload POD.
5. Load becomes ready to bill → invoice → send in a batch → record payment → shows as paid.
6. Generate a pay-period settlement → approve → immutable.
7. Planner: add an office event, edit a color code, switch day/week/month views.
8. A user without `accounting.settlements.approve` cannot approve (UI hidden, API 403).

---

## 33. Disaster recovery

- **Postgres:** continuous WAL archiving / point-in-time recovery (RPO ≤ 5 min), daily snapshots
  retained 35 days, monthly snapshots retained 12 months, one copy in a second region.
- **Object storage:** versioning on, cross-region replication for documents.
- **Redis:** holds nothing that is not recoverable from Postgres; persistence on for faster recovery.
- **Configuration and infrastructure:** in Git (infrastructure as code); secrets in the manager
  with backup.
- **Runbooks** in `docs/23-disaster-recovery.md`: restore database to a point in time, restore a
  single organization's data, region outage, credential leak, provider outage.
- **Restore drill every quarter** into staging, timed against the RTO; results recorded.

---

## 34. Code quality and dependencies

### 34.1 Code

- `strict: true` in every `tsconfig` (plus the checks already on: `noUnusedLocals`,
  `noUnusedParameters`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`), and
  `noUncheckedIndexedAccess`. No `any` without a comment explaining why.
- oxlint (already used) with React hooks rules as errors; Prettier formatting enforced in CI.
- Small, well-named functions; business rules in one place; comments explain *why*, not *what*.
- Follow the patterns the codebase already has (native `<dialog>` popups, `ui-*` components,
  tokens for every color) before introducing new ones.

### 34.2 Dependencies

Before adding one: why it is needed; whether an existing dependency or a few lines of code would
do; maintenance activity and release history; licence (MIT/Apache/BSD preferred; no AGPL in
shipped code without approval); security history; bundle-size cost for anything shipped to the
browser (checked against the §3.2 budgets). Renovate/Dependabot keeps versions current; lockfiles
are committed.

---

## 35. Git policy

- Branches: `main` (production, protected) + short-lived `feature/<name>`, `fix/<name>`,
  `docs/<name>`, `chore/<name>`. Every branch gets a preview deployment.
- Commits: Conventional Commits — `feat: add load creation API`, `fix: enforce tenant filter on
  stops`, `test: cover settlement approval`, `docs: …`, `chore: …`. The body explains why.
- Pull requests: one topic each, description with what changed, how it was tested, screenshots for
  UI, and any migration or rollout notes.
- Merged branches are deleted.

---

## 36. How Claude must work on Runtruck

### 36.1 Every task

1. Read this document, the relevant detailed spec, and `CLAUDE.md`.
2. Inspect the existing code and how similar things are already done.
3. Identify affected modules, permissions, tables, events and screens.
4. Write a short plan; for anything non-trivial, use the feature template (§37).
5. Implement the smallest correct change on a `feature/*` or `fix/*` branch.
6. Run typecheck, lint and relevant tests (locally when Node is available; otherwise CI).
7. Review security, tenant isolation, permissions, database impact and performance budgets.
8. Push the branch; confirm the preview builds and the change works there.
9. Report: what changed, how it was verified, what is left or uncertain.
10. **Merge to `main` only when the owner explicitly says so.**

### 36.2 Claude must not

- Rewrite large parts of the application, change the technology stack, replace PostgreSQL, or add
  services or infrastructure without approval.
- Push to `main`, force-push shared branches, or make destructive changes to production data
  without explicit approval.
- Delete working functionality or modify unrelated modules.
- Disable or weaken security checks, tenant isolation, validation or tests to make something pass.
- Give AI features unrestricted data access.
- Put secrets in code, commits, logs or the browser.
- Invent database structures that contradict `03-database.md`, or external API behaviour that has
  not been verified.
- Hide errors, ignore failing checks, or call incomplete work complete.
- Silently pick an assumption when requirements conflict — raise the conflict (§40).

---

## 37. Feature template and definition of done

```
FEATURE:            PURPOSE:            USERS / ROLES:
PERMISSIONS:        SCREENS:            DATABASE TABLES / CHANGES (+ migration plan):
API ENDPOINTS:      VALIDATION:         BUSINESS RULES:
STATE CHANGES:      EVENTS:             JOBS:              NOTIFICATIONS:
INTEGRATIONS:       AI TOOLS:           SECURITY / PRIVACY:
PERFORMANCE (expected volume, budgets): FEATURE FLAG:
ERROR CASES:        TESTS:              ACCEPTANCE CRITERIA:
```

A feature is **done** only when: requirements implemented · validation, permissions and tenant
isolation implemented and tested · tests at the levels in §32 passing · typecheck, lint and build
passing · performance budgets met · audit and events in place · documentation updated ·
preview verified · acceptance criteria met · no known critical issues.

---

## 38. Worked example — Create Load

**Purpose:** a dispatcher enters a new load (today's New Load form) and it goes on the board.

**Permission:** `loads.create` (+ `dispatch.assign` if a driver or carrier is chosen in the same
step).

**Input** (Zod schema in `packages/domain`, shared by the form and the API): customer, bill-to,
references, mode, equipment; ≥ 1 pickup and ≥ 1 delivery stop, each with facility, address, date,
optional window, in chronological order; commodity, weight (> 0), optional pieces, packaging,
value, temperature (reefer), hazmat + UN number; LTL class and handling units when mode is LTL;
own fleet (driver/truck/trailer optional) or partner carrier (carrier and carrier rate required);
line haul (> 0), fuel surcharge, accessorials, miles, driver pay, terms; notes. These are exactly the
fields and rules the prototype's New Load form already enforces.

**Back-end flow:**

```
authenticate → organization from session → check loads.create
→ validate (422 with field errors) → check Idempotency-Key
→ resolve customer, facilities (create new facilities if typed), carrier — all in this organization
→ compute charges and totals in cents (packages/domain) — ignore any totals sent by the client
→ BEGIN
     SET LOCAL app.organization_id
     allocate load_number (per-organization sequence)
     insert loads, load_stops (with facility time zones), load_charges, load_references
     if driver/carrier given: run dispatch checks (§17) and insert dispatch
     insert audit_log (LOAD_CREATED), outbox_event (LoadCreated [+ LoadDispatched])
   COMMIT
→ 201 { data: load, meta: { requestId } }
```

**Afterwards (jobs):** notify the assigned driver; refresh live boards and planners; request mileage
from the routing provider if miles were left blank; attach uploaded documents.

**Acceptance tests:**

1. A dispatcher creates a load; it appears on the board, the load page and the planner.
2. A user without `loads.create` gets 403; the button is hidden.
3. An `organization_id` in the body is ignored; the load belongs to the session's organization.
4. A customer ID from another organization → 404.
5. Missing or invalid fields → 422 with per-field messages matching the form's.
6. Delivery before pickup → 422.
7. Negative or zero line haul → 422.
8. Same `Idempotency-Key` twice → one load, same response.
9. `LoadCreated` event written in the same transaction; audit entry present.
10. Unit, integration, isolation and end-to-end tests pass; p95 ≤ 400 ms in staging.

---

## 39. Development phases

Each phase ends with its exit criteria met and the live site working. Phases 0–1 need no back end
and can start immediately.

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0 — Harden today's web app** | `strict` TypeScript; root and route error boundaries; route code splitting; security and cache headers in `vercel.json`; GitHub Actions (lint, typecheck, build, bundle budget); Vitest for `dates`, planner layout, New Load validation; Playwright smoke test on previews; Node LTS on the dev machine; fix README. | CI green on every PR; bundle budget enforced; one screen crashing no longer blanks the app. |
| **1 — Monorepo foundation** | pnpm + Turborepo; `apps/web`, `apps/site`, `packages/domain`, `packages/ui`, `packages/config`; data access layer in the web app (`api/` hooks returning the mock data, so screens stop importing `data/*` directly). | Same product, new structure; every screen reads data through hooks. |
| **2 — API skeleton** | NestJS app, config validation, request context, error envelope, health checks, OpenTelemetry, Docker Compose (Postgres, Redis, MinIO), Drizzle + first migrations, seed from mock data, API deployed to staging. | `GET /health/ready` green in staging; seed loads the demo company. |
| **3 — Auth + tenancy** | Chosen auth (D9), organizations, memberships, sessions, RLS, tenant-isolation test harness, real login/logout in the web app. | Two demo organizations fully isolated; isolation suite green. |
| **4 — Roles and permissions** | Catalogue, default roles, guards, UI gating, role management screen. | Journey 8 passes. |
| **5 — Reference data** | Customers, facilities (with time zones), carriers, drivers, trucks, trailers, user preferences; web screens switched from mock to API per domain behind feature flags. | Fleet, CRM and Facilities run on real data. |
| **6 — Loads** | Loads, stops, charges, references, status machine, search and filters, New Load on the API, load page. | Journey 2 passes; board paginated and searchable server-side. |
| **7 — Dispatch + live updates** | Dispatch checks, board, WebSocket updates, planner API (§18). | Journeys 3 and 7 pass; two browsers see changes live. |
| **8 — Documents** | Uploads, storage, versions, scanning, previews. | POD upload works end-to-end. |
| **9 — Driver app** | Expo app: login, assigned loads, stop workflow, documents, push. | Journey 4 passes on iOS and Android test builds. |
| **10 — Tracking** | Telematics adapter (first provider), location pings, ETA. | Live positions on load page; provider outage handled by breaker. |
| **11 — Billing** | Invoices, batches, payments, aging. | Journey 5 passes. |
| **12 — Settlements + payables** | Pay rules, settlements, deductions, bills. | Journey 6 passes. |
| **13 — Safety, maintenance, HR** | Work orders, qualification files, violations, claims, contracts, onboarding, reminders; restricted data controls (§20). | Expiring documents block dispatch per rules. |
| **14 — Integrations** | One provider at a time: routing, accounting, fuel, load boards, factoring, EDI. | Each has sandbox tests, breaker, monitoring. |
| **15 — AI** | Tool layer, read/suggest tools first, then write with confirmation. | AI actions audited; sensitive actions always confirmed. |
| **16 — Production hardening** | Pen test, load test, restore drill, alerting, status page, runbooks, SLO dashboards. | §3 targets met in staging under load; restore within RTO. |

---

## 40. Documentation hierarchy and source of truth

```
docs/
  01-product-requirements.md      13-document-system.md
  02-development-architecture.md  14-notification-system.md
  03-database.md                  15-integration-architecture.md
  04-api.md                       16-ai-architecture.md
  05-authentication.md            17-event-architecture.md
  06-multi-tenancy.md             18-background-jobs.md
  07-roles-permissions.md         19-security.md
  08-load-lifecycle.md            20-testing.md
  09-dispatch-lifecycle.md        21-deployment.md
  10-driver-lifecycle.md          22-monitoring.md
  11-billing-lifecycle.md         23-disaster-recovery.md
  12-settlement-lifecycle.md      24-development-phases.md
  adr/NNNN-*.md                   (decision records)
```

This document sets the rules; the others hold the detail and are written as their phase begins.

When sources conflict, the higher one wins:

1. Explicitly approved product requirements
2. Security requirements
3. Database specification
4. This development architecture
5. API specification
6. Domain specifications (lifecycles)
7. Existing implementation
8. Claude's assumptions

A conflict is never resolved silently: it is written down and raised with the owner.

---

## 41. Open decisions

These need the owner's answer; the recommended option is listed first.

| # | Question | Recommendation |
| --- | --- | --- |
| O1 | Keep the Vite + React Router SPA instead of moving to Next.js (D1)? | Keep the SPA; split the marketing site out (D2). |
| O2 | Hosting for API, workers, Postgres, Redis (D10)? | Evaluate AWS, Render, Fly.io and Railway on cost, managed Postgres with PITR, private networking and region; one-week comparison. |
| O3 | Authentication (D9)? | One-week spike: a self-hosted library with organizations (e.g. Better Auth) vs a managed provider (e.g. WorkOS/Clerk); decide on SSO and MFA needs and cost. |
| O4 | Trunk-based Git without a `develop` branch (D18)? | Yes. |
| O5 | Planner color codes shared by the organization, with personal display preferences? | Yes (§18). |
| O6 | Primary region and data residency (US only at launch?) | One US region close to the first customers; second-region backups only. |
| O7 | Which telematics / ELD provider first? | The one the first customers use (ask them). |
| O8 | Install Node.js LTS + pnpm on the development machine, or use Codespaces? | Install locally; both are fine. |

---

## 42. Glossary

| Term | Meaning |
| --- | --- |
| Load | A shipment Runtruck manages, from booking to payment. |
| Stop | A pickup or delivery location on a load, with an appointment window. |
| Loaded / Empty | Where a truck picks up freight / where it delivers and becomes empty (planner color codes). |
| Deadhead | Miles driven empty to the next pickup. |
| Dispatch | Assigning a driver, truck and trailer (or a partner carrier) to a load. |
| HOS | Hours of service — federal limits on driving time, recorded by the ELD. |
| ELD | Electronic logging device (telematics provider). |
| BOL | Bill of lading — the shipping document signed at pickup. |
| POD | Proof of delivery — signed BOL or receipt at delivery; required to bill. |
| Rate con | Rate confirmation — the agreed price for a load. |
| Lumper | Third-party unloading service at a warehouse, often reimbursed. |
| Accessorials | Extra charges: detention, liftgate, layover, TONU, etc. |
| TONU | Truck ordered, not used — cancellation fee. |
| FTL / LTL | Full truckload / less than truckload. |
| NMFC, freight class | LTL classification used for pricing. |
| MC / DOT number | Carrier operating authority and USDOT identifiers. |
| Settlement | Pay statement for a driver or partner carrier for a period. |
| Factoring | Selling invoices to a factoring company for faster payment. |
| Aging | Grouping unpaid invoices by days outstanding. |
| Clearinghouse | FMCSA Drug & Alcohol Clearinghouse. |
| DQ file | Driver qualification file (CDL, medical card, MVR, annual review, …). |
| IFTA | International Fuel Tax Agreement — quarterly fuel tax reporting. |
| RLS | Postgres row-level security. |
| Outbox | Table of events written in the same transaction as the change they describe. |
| RPO / RTO | How much data may be lost / how long recovery may take after a disaster. |
| SLO | Service level objective — a measurable reliability target. |
