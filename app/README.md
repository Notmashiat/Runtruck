# RunTruck

A React + TypeScript implementation of the RunTruck TMS/CRM design (`../RunTruck Live.dc.html`)
and marketing site (`../RunTruck Site.dc.html`), built from the Claude Design handoff bundle in
the repo root.

## Stack

- Vite + React 19 + TypeScript
- React Router for client-side routing (`/` marketing site, `/app/*` the operations app)
- Plain CSS, using the "Industry" design system tokens/components from the handoff
  (`src/styles/industry.css`, copied verbatim from the bundle) plus the small additions each
  prototype layered on top (`src/styles/app.css`)
- Static in-memory mock data (`src/data/mock.ts`) — no backend, matching the original prototype

## Structure

```
src/
  components/       Sidebar, Header, AppLayout, and small shared pieces (Blueprint, Tag, ComingSoon)
  context/          AppShellContext — shared UI state (search, tab filters, settlement approval)
                     that persists across navigation within the app shell
  data/mock.ts       All mock data: loads, drivers, trucks, customers, invoices, settlements,
                     plus the sidebar entries (NAV) and per-screen header titles (HEAD)
  pages/app/         One file per screen; Accounting's two tabs are InvoicesPage and SettlementsPage
  pages/marketing/   The public landing page
```

The sidebar has nine sections. Three are placeholders (`ComingSoon`) until they are designed:

| Sidebar    | URL                           | Screen                                                |
| ---------- | ----------------------------- | ----------------------------------------------------- |
| Dashboard  | `/app/dashboard`              | `DashboardPage`                                       |
| Loads      | `/app/loads`                  | `LoadsPage`; `/app/loads/:id` opens `LoadDetailPage`  |
| Planner    | `/app/planner`                | `PlannerPage` (placeholder)                           |
| Fleet      | `/app/fleet`                  | `TrucksPage` — trucks and trailers                    |
| CRM        | `/app/crm`                    | `CustomersPage`                                       |
| Facilities | `/app/facilities`             | `FacilitiesPage` (placeholder)                        |
| Accounting | `/app/accounting`             | `AccountingPage`, Invoicing tab (`InvoicesPage`)      |
|            | `/app/accounting/settlements` | `AccountingPage`, Settlements tab (`SettlementsPage`) |
| HR         | `/app/hr`                     | `DriversPage`                                         |
| Safety     | `/app/safety`                 | `SafetyPage` (placeholder)                            |

The pre-reorganisation URLs redirect to their new homes: `/app/drivers` → `/app/hr`, `/app/trucks` →
`/app/fleet`, `/app/customers` → `/app/crm`, `/app/invoices` → `/app/accounting` and `/app/settlements` →
`/app/accounting/settlements`.

Routing replaces the original prototype's internal view-state + localStorage persistence:
every screen (including a given load's detail view) is a real URL, so reloading or sharing a
link lands you back on the same screen.

## Develop

```
npm install
npm run dev
```

## Build

```
npm run build
```

## Deploy (Vercel)

`vercel.json` is set up for a single-page app (all paths fall back to `index.html`, which
`react-router` needs since routes like `/app/loads/L-40218` only exist client-side).

To deploy:

1. Go to [vercel.com/new](https://vercel.com/new) and import the `Notmashiat/Runtruck` GitHub repo.
2. Set **Root Directory** to `app` (the repo root is the Claude Design handoff bundle, not the app).
3. Framework preset should auto-detect as **Vite** — build command `npm run build`, output
   directory `dist`. Leave as-is.
4. Deploy. Every push to `main` will redeploy automatically after this.

Or from the CLI, from inside `app/`:

```
npx vercel        # first deploy, follow the prompts (set root directory questions as above)
npx vercel --prod # promote to production
```
