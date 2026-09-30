# RunTruck

A React + TypeScript implementation of RunTruck: the operations app (`/app/*`, with its own light/dark,
card-based UI) and the marketing site (`../RunTruck Site.dc.html`), built from the Claude Design
handoff bundle in the repo root.

## Stack

- Vite + React 19 + TypeScript
- React Router for client-side routing (`/` marketing site, `/app/*` the operations app)
- Plain CSS. The app (`/app/*`) uses its own light/dark, card-based UI (`src/styles/shell.css`, the
  `ui-*` classes, Inter); the marketing site uses the "Industry" design system from the handoff
  (`src/styles/industry.css`, copied from the bundle; only its font `@import` moved to `index.html`), and `src/styles/app.css` holds
  the small shared additions
- Static in-memory mock data (`src/data/mock.ts`) — no backend, matching the original prototype

## Structure

```
src/
  components/       Sidebar (with Settings and Log out), SettingsDialog (Profile + Appearance),
                     NewLoadDialog (the "+ New Load" form), Header
                     (the top bar: search, Filters, per-screen actions), AppLayout, SectionTabs +
                     TabbedSection (the pill tab bar), and shared pieces: Card, Kpis,
                     Tag (status chip), ComingSoon, Blueprint (marketing site only)
  context/          AppShellContext — shared UI state (search, tab filters, settlement approval)
                     that persists across navigation within the app shell
  data/             mock.ts — loads, drivers, trucks, customers, invoices, settlements, plus the
                     sidebar entries (NAV) and each section's tabs (SECTION_TABS);
                     accounting.ts, fleet.ts, hr.ts, safety.ts — data for those sections' tabs
  lib/               search.ts (the top-bar search filters whichever table is on screen) and
                     theme.ts (light/dark, stored in localStorage, applied as data-theme on <html>)
  pages/app/         One file per screen; tabbed sections keep their tabs in a subfolder
                     (fleet/, accounting/, hr/, safety/)
  pages/marketing/   The public landing page
  styles/            shell.css (the app's ui-* classes), industry.css (design-system tokens; the
                     marketing site), app.css (shared bits)
```

The sidebar has nine sections. Four are split into tabs (a centred pill bar; each tab is its own
URL, and a section's root URL opens its first tab) and one is a placeholder (`ComingSoon`) until
it is designed:

| Sidebar    | URL                                                                            | Screen                                                        |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Dashboard  | `/app/dashboard`                                                               | `DashboardPage`                                               |
| Loads      | `/app/loads`                                                                   | `LoadsPage` (rows expand inline); `/app/loads/:id` opens `LoadDetailPage` |
| Planner    | `/app/planner`                                                                 | `PlannerPage` — day / week / month calendar                   |
| Fleet      | `/app/fleet/{drivers,trucks,trailers}`                                         | `fleet/DriversTab`, `TrucksTab`, `TrailersTab`                |
| CRM        | `/app/crm`                                                                     | `CustomersPage`                                               |
| Facilities | `/app/facilities`                                                              | `FacilitiesPage` (placeholder)                                |
| Accounting | `/app/accounting/{uninvoiced,invoiced,batches,past-due,paid,payroll,bills}`    | `accounting/UninvoicedTab` … `BillsTab`                       |
| HR         | `/app/hr/{employee-contracts,onboarding}`                                      | `hr/EmployeeContractsTab`, `OnboardingTab`                    |
| Safety     | `/app/safety/{maintenance,driver-documents,violations,settlements}`            | `safety/MaintenanceTab`, `DriverDocumentsTab`, `ViolationsTab`, `ClaimSettlementsTab` |

Older URLs redirect to their new homes: `/app/drivers` → `/app/fleet/drivers`, `/app/trucks` →
`/app/fleet/trucks`, `/app/customers` → `/app/crm`, `/app/invoices` → `/app/accounting/invoiced`, and
`/app/settlements` and `/app/accounting/settlements` → `/app/accounting/payroll`.

The sidebar foot has the signed-in user (`USER` in `data/mock.ts`, with Member ID and Company ID),
**Settings** — a popup with a Profile page and an Appearance page whose dark-mode switch darkens the
whole site (app and marketing page; `:root[data-theme="dark"]` tokens in `shell.css` and `app.css`) —
and **Log out**, which returns to the marketing page.

**+ New Load** (Dashboard and Loads) opens a large popup with sections for load info, stops
(multi-stop), freight, LTL details, carrier (own fleet or a partner carrier from `CARRIERS`), driver
and equipment, rates, documents, notes and a review page. Required fields are checked on Create; the
load is added through `addLoad` in `AppShellContext` and shows on the board and its own detail page.
**Edit load** (under "Open load →" in an expanded row, and on the load page) reopens the same form
prefilled; **Delete load** in its footer asks for confirmation first. Loads are kept in this
browser's storage (`runtruck-loads`) until there is a backend, so new, edited and deleted loads
survive a reload on that browser only.

**Planner** is a calendar with Day, Week and Month views (`pages/app/PlannerPage.tsx`,
`styles/calendar.css`). Pickups and deliveries come from the loads (`loadEvents` in
`data/planner.ts`); the office's own events (`PLANNER_EVENTS`) can be added, edited and deleted.
**Customize** has three pages: Layout (week start, weekends, day hours, row height, 12/24h), Color
codes (rename, recolor, add and delete what each color means; color load stops by stop type —
Loaded / Empty — or by driver, customer or truck) and Event cards (what each of a card's three lines
shows; by default the city and state where the truck loads or goes empty, then time and load #).
Events, color codes and preferences are saved in localStorage; Layout › Reset puts all of it back.
Office events can be dragged (pointer events, 15-minute snap in Day/Week, whole days in the
all-day row and Month view) and resized from their bottom edge; each drop can be undone. Load
stops come from the load board and are not draggable.

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
