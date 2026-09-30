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
                     NewLoadDialog (the "+ New Load" form), RecordDialog + FleetDialogs (the
                     driver, unit and trailer forms), FacilityDialog, Header
                     (the top bar: search, Filters, per-screen actions), AppLayout, SectionTabs +
                     TabbedSection (the pill tab bar), and shared pieces: Card, Kpis,
                     Tag (status chip), ComingSoon, Blueprint (marketing site only)
  context/          AppShellContext — shared UI state (search, tab filters, settlement approval)
                     plus the loads and fleet records, which persist in this browser's storage
  data/             mock.ts — loads, drivers, trucks, customers, invoices, settlements, plus the
                     sidebar entries (NAV) and each section's tabs (SECTION_TABS);
                     accounting.ts, fleet.ts, hr.ts, safety.ts — data for those sections' tabs
                     (fleet.ts: the demo fleet's full records, form choices and form → table
                     conversions; facilities.ts: the facility register)
  lib/               search.ts (the top-bar search filters whichever table is on screen) and
                     theme.ts (light/dark, stored in localStorage, applied as data-theme on <html>)
  pages/app/         One file per screen; tabbed sections keep their tabs in a subfolder
                     (fleet/, accounting/, hr/, safety/)
  pages/marketing/   The public landing page
  styles/            shell.css (the app's ui-* classes), industry.css (design-system tokens; the
                     marketing site), app.css (shared bits)
```

The sidebar has nine sections. Four are split into tabs (a centred pill bar; each tab is its own
URL, and a section's root URL opens its first tab):

| Sidebar    | URL                                                                            | Screen                                                        |
| ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Dashboard  | `/app/dashboard`                                                               | `DashboardPage`                                               |
| Loads      | `/app/loads`                                                                   | `LoadsPage` (rows expand inline); `/app/loads/:id` opens `LoadDetailPage` |
| Planner    | `/app/planner`                                                                 | `PlannerPage` — day / week / month calendar                   |
| Fleet      | `/app/fleet/{drivers,trucks,trailers}`                                         | `fleet/DriversTab`, `TrucksTab`, `TrailersTab`                |
| CRM        | `/app/crm`                                                                     | `CustomersPage`                                               |
| Facilities | `/app/facilities`                                                              | `FacilitiesPage`                                              |
| Accounting | `/app/accounting/{uninvoiced,invoiced,batches,past-due,paid,payroll,bills}`    | `accounting/UninvoicedTab` … `BillsTab`                       |
| HR         | `/app/hr/{employee-contracts,onboarding}`                                      | `hr/EmployeeContractsTab`, `OnboardingTab`                    |
| Safety     | `/app/safety/{maintenance,driver-documents,violations,settlements}`            | `safety/MaintenanceTab`, `DriverDocumentsTab`, `ViolationsTab`, `ClaimSettlementsTab` |

Older URLs redirect to their new homes: `/app/drivers` → `/app/fleet/drivers`, `/app/trucks` →
`/app/fleet/trucks`, `/app/customers` → `/app/crm`, `/app/invoices` → `/app/accounting/invoiced`, and
`/app/settlements` and `/app/accounting/settlements` → `/app/accounting/payroll`.

The sidebar collapses to an icon rail (the button beside the logo; the choice is kept in
`runtruck-sidebar-collapsed`). Each section has a line icon (`components/NavIcons.tsx`), and in the
rail its name shows as a hover tip. On narrow screens it starts collapsed and opens over the page.

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

**Fleet records.** **+ Add Driver**, **+ Add Unit** and **+ Add Trailer** (Fleet › Drivers, Trucks,
Trailers) each open their own popup in the New Load style (`components/RecordDialog.tsx` is the form
engine, `components/FleetDialogs.tsx` the three forms):

- Driver — personal and emergency contact, employment (ID, type, status, hire date, terminal,
  dispatcher), CDL (number, state, class, expiry, endorsements, restrictions, hazmat and TWIC
  expiry), qualification-file dates (medical card, MVR, annual review, drug test, Clearinghouse,
  road test), assigned truck and pay, notes.
- Unit — unit number, status, ownership, driver, terminal; VIN, year, make, model, cab, fuel,
  engine, GVWR, axles; plate, registration, IRP, IFTA, DOT inspection, insurance; odometer and
  service schedule, ELD serial, tires; purchase or lease terms; notes.
- Trailer — number, type, length, status, location, ownership; VIN, year, make, model, axles,
  suspension, doors, payload; the reefer unit (reefers only); registration, inspection,
  insurance; service dates; notes.

Required fields, formats (VIN, state, ZIP, phone, email, model year) and duplicates (unit numbers,
employee IDs, VINs, driver names) are checked on save, with a count per section in the side menu.
Every row has **Edit**, which reopens the form prefilled; its footer has **Archive** (hide the record
from lists, pickers and totals but keep it — **Show archived** on each table brings it back, and
**Restore** undoes it) and **Delete** (permanent, after a confirmation). A driver's truck and a
truck's driver are one assignment: changing either side updates the other and frees what it
replaced; archiving a driver or unit frees its assignment. The New Load driver/truck/trailer pickers and the Dashboard driver list use these records.
They are stored as `runtruck-drivers`, `runtruck-trucks` and `runtruck-trailers`.

**Invoicing** (`data/invoicing.ts`, `components/InvoiceDialog.tsx`, `BatchDialog.tsx`, `ReminderDialog.tsx`,
`InvoiceDetail.tsx`). Invoices and batches are records in `AppShellContext`, stored as
`runtruck-invoices` and `runtruck-batches`; an invoice's status follows from it (Draft, Unsent, Sent,
Overdue once past its due date, Paid).

- **Uninvoiced** lists delivered loads with no invoice (the billing queue plus Delivered / Needs POD
  loads on the board). Clicking a load number opens a small popup with the load's details (dates,
  reference, freight, stops, rate breakdown, bill-to and terms). **+ New Invoice** (top right) and **New invoice** on each row open the invoice
  popup: customer and bill-to, the delivered loads to bill (ticking one adds its line haul and fuel
  surcharge), invoice date / terms / due date / PO / BOL, shipment details, an editable charges table
  (detention, lumper, stop-off, discounts…), notes, and a **Preview** of the PDF. Save draft, Create
  invoice, or Create & email; Edit and Delete from the invoice later.
- The **PDF** (`lib/invoicePdf.ts`) is written by `lib/pdf.ts`, a small dependency-free PDF writer
  (standard Helvetica fonts, US Letter): letterhead, key dates and amount due, bill-to and shipment,
  charges, totals, payment instructions and page footers; PAID / PAST DUE / DRAFT stamps. The preview
  draws the same page operations as SVG (`components/PdfPages.tsx`).
- **Email** fills in the message to the billing contact and downloads the PDF to attach, then opens
  the person's email app (there is no mail server yet) and marks the invoice sent.
- **Invoiced** lists open invoices (Draft / Unsent / Sent) with **+ New Invoice**; each row drops down
  to the bill-to, dates, charges and history with Edit, Email, Download PDF and Record payment.
- **Batches**: **+ New Batch** picks a recipient (a customer, or TriPoint Capital for factoring) and
  its unpaid invoices. Each batch drops down to its invoices, with Mark as sent, Download batch PDF
  (every invoice in one file), Edit batch and Delete batch (the invoices stay).
- **Past due** rows drop down to the full invoice detail. **Send reminders** (top right, or Remind on a
  row) picks invoices, adds an optional late fee (% of balance or flat, added as a line on the
  invoice), sends by email and/or text with an editable message per customer, records the reminder
  on each invoice, and opens the messages in the person's email and messaging apps.

**Facilities** (`pages/app/FacilitiesPage.tsx`, `data/facilities.ts`, `components/FacilityDialog.tsx`)
is the register of every place a truck stops: customer sites (shippers, receivers, cross-docks,
ports), Sunridge's terminals, drop yards and shops, and truck stops and scales on the lanes. The demo
register has the sites on the load board, the three yards, the shops from Safety › Maintenance and
three road stops. **+ Add Facility** / **Edit** open a sectioned form (site and customer account,
address and map point, weekly hours, scheduling and booking, dock and loading, lumper and detention,
yard space and services, PPE and site rules, contacts, driver rating); Archive and Delete work as for
the fleet. Each row expands to the site's details plus what happens there: the loads that stop at a
customer site, the trailers parked and trucks and drivers based at a yard, a shop's open work orders.
Load stops link to a facility by name (ignoring case): the New Load form suggests registered
facilities and fills in the address and contact, the load page shows each stop's hours, booking,
lumper, PPE and a **Facility →** link (`/app/facilities?open=FAC-…`), renaming a facility renames it
on its loads, and stops whose facility is not registered are listed with **+ Add to register**.
Stored as `runtruck-facilities`.

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
