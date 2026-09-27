# RunTruck

A React + TypeScript implementation of RunTruck: the operations app (`/app/*`, with its own light,
card-based UI) and the marketing site (`../RunTruck Site.dc.html`), built from the Claude Design
handoff bundle in the repo root.

## Stack

- Vite + React 19 + TypeScript
- React Router for client-side routing (`/` marketing site, `/app/*` the operations app)
- Plain CSS. The app (`/app/*`) uses its own light, card-based UI (`src/styles/shell.css`, the
  `ui-*` classes, Inter); the marketing site uses the "Industry" design system from the handoff
  (`src/styles/industry.css`, copied verbatim from the bundle), and `src/styles/app.css` holds
  the small shared additions
- Static in-memory mock data (`src/data/mock.ts`) — no backend, matching the original prototype

## Structure

```
src/
  components/       Sidebar, Header (the top bar: search, Filters, per-screen actions), AppLayout,
                     SectionTabs + TabbedSection (the pill tab bar), and shared pieces: Card, Kpis,
                     Tag (status chip), ComingSoon, Blueprint (marketing site only)
  context/          AppShellContext — shared UI state (search, tab filters, settlement approval)
                     that persists across navigation within the app shell
  data/             mock.ts — loads, drivers, trucks, customers, invoices, settlements, plus the
                     sidebar entries (NAV) and each section's tabs (SECTION_TABS);
                     accounting.ts, fleet.ts, hr.ts, safety.ts — data for those sections' tabs
  lib/search.ts      matchesQuery — the top-bar search filters whichever table is on screen
  pages/app/         One file per screen; tabbed sections keep their tabs in a subfolder
                     (fleet/, accounting/, hr/, safety/)
  pages/marketing/   The public landing page
  styles/            shell.css (the app's ui-* classes), industry.css (design-system tokens; the
                     marketing site), app.css (shared bits)
```

The sidebar has nine sections. Four are split into tabs (a centred pill bar; each tab is its own
URL, and a section's root URL opens its first tab) and two are placeholders (`ComingSoon`) until
they are designed:

| Sidebar    | URL                                                                            | Screen                                                        |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Dashboard  | `/app/dashboard`                                                               | `DashboardPage`                                               |
| Loads      | `/app/loads`                                                                   | `LoadsPage` (rows expand inline); `/app/loads/:id` opens `LoadDetailPage` |
| Planner    | `/app/planner`                                                                 | `PlannerPage` (placeholder)                                   |
| Fleet      | `/app/fleet/{drivers,trucks,trailers}`                                         | `fleet/DriversTab`, `TrucksTab`, `TrailersTab`                |
| CRM        | `/app/crm`                                                                     | `CustomersPage`                                               |
| Facilities | `/app/facilities`                                                              | `FacilitiesPage` (placeholder)                                |
| Accounting | `/app/accounting/{uninvoiced,invoiced,batches,past-due,paid,payroll,bills}`    | `accounting/UninvoicedTab` … `BillsTab`                       |
| HR         | `/app/hr/{employee-contracts,onboarding}`                                      | `hr/EmployeeContractsTab`, `OnboardingTab`                    |
| Safety     | `/app/safety/{maintenance,driver-documents,violations,settlements}`            | `safety/MaintenanceTab`, `DriverDocumentsTab`, `ViolationsTab`, `ClaimSettlementsTab` |

Older URLs redirect to their new homes: `/app/drivers` → `/app/fleet/drivers`, `/app/trucks` →
`/app/fleet/trucks`, `/app/customers` → `/app/crm`, `/app/invoices` → `/app/accounting/invoiced`, and
`/app/settlements` and `/app/accounting/settlements` → `/app/accounting/payroll`.

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
