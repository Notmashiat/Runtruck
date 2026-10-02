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

The sidebar foot has the signed-in user, **Settings** and **Log out** (back to the marketing page).

**Settings** (`/app/settings/<section>`, `pages/app/SettingsPage.tsx`, `data/settings.ts`,
`lib/settingsStore.ts`, `lib/applySettings.ts`; stored as `runtruck-settings`). Sections: Profile
(name, title, email, phone, time zone — the sidebar, greeting and email signatures), Company (names,
USDOT/MC/EIN, address, phone, billing email, website — the invoice letterhead and emails), Invoicing
& payments (number prefix and start, default terms, fuel surcharge %, late fee %, bank, account last
4, remit-to, payment note, footer, factoring company), Messages (invoice email and reminder
email/text templates with {placeholders} and a live preview), Operations (home terminals for the
fleet forms, hours-of-service warning, document renewal window, unbilled-days flag, detention
defaults), Alerts (which Needs attention items the dashboard shows), Team (members and roles; Admins
and Dispatchers are the dispatchers on driver records), Appearance (light/dark/system, accent colour,
text size, table spacing, start page) and Data (back up to a file, restore, reset records or
settings). Text sections save with Save/Discard; toggles and appearance apply at once.

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

**Sorting and filters** (`lib/tableTools.tsx`, `components/FilterPanel.tsx`). Every table column
sorts: click a header for ascending, again for descending, a third time for the original order;
money, miles, weights, percentages, hours, dates and ids sort by value, blanks last. **Filters** in
the top bar opens a side panel with filters made for that page (status, customer, driver,
equipment, dates, amounts, yes/no checks …; choices show how many rows have them). Active filters
show as chips under the top bar, with × and Clear all; they are kept per page while you move around.

**Dashboard** (`pages/app/DashboardPage.tsx`, `components/DashboardWidgets.tsx`,
`DashboardCustomize.tsx`, `data/dashboard.ts`, `styles/dashboard.css`) is a 12-column grid of
widgets: number cards (active loads, revenue this week, rate per mile, unbilled, past-due AR,
drivers available, trucks in service, docs to renew), analysis cards (needs attention, revenue
delivered, receivables aging, revenue by customer, top lanes, cash next 14 days, fleet status) and
tables/lists (active loads, drivers, next 7 days). **Customize** turns on edit mode: drag a widget's
handle to move it, its corner to change width (grid columns) and height (10 px steps — how many
table rows show), × to hide it. **Widgets & options** shows/hides, sizes and orders every widget and
sets spacing, greeting, notes, the revenue chart's period and style, the customer breakdown's period
and the active-loads columns. The layout is kept in `runtruck-dashboard`; narrow screens use 6 or 1
columns.

**Login** (`/login`, `pages/LoginPage.tsx`, `lib/auth.ts`, `lib/account.ts`, `lib/password.ts`). The app
needs a signed-in session; without one every `/app` page sends you to the login (and back afterwards).
The login page asks only for email and password. Two kinds of account can log in: RunTruck's owner
(Account ID 100482731, Company ID 1, a super admin), and accounts made in Developer › Create account.
Passwords are never stored, only a salted PBKDF2-SHA-256 fingerprint (210,000 rounds), so nobody can read
one back — a super admin can only replace it. "Keep me signed in" lasts 30 days, otherwise until the
browser closes (at most 12 hours). Five wrong tries lock the form for a minute. A disabled account, or an
account whose company is paused or cancelled, cannot log in. Every account changes its own password in
Settings › Security; only super admins change a login email (their own there, anyone's in Developer).

**One company's data per session** (`lib/account.ts`). The session says which Company ID is open, and
every record and setting is stored under it (`runtruck-<company ID>-loads`, …), so an account reads and
writes its own company's data and nothing else. Logging in or out reloads the page, and a tab whose
session changes in another tab reloads too, so data from two companies is never in memory together.
Company ID 1 (RunTruck) keeps the built-in demo records; a client company starts with none, and its
settings start from its own entry in the client register (no demo team, terminals, bank or customers).
Profile and Appearance are per account (`…-member-<account ID>-settings`); the rest of Settings is shared
by the company. Settings › Data only backs up, restores or resets the open company, and never logins or
RunTruck's registers. Anything saved under the old ID 30017 or unscoped moves to Company ID 1.

**Permissions** (`data/accounts.ts`, `can()` in `lib/auth.ts`, `App.tsx`). Every account has the
Dashboard and its own Profile, Security and Appearance. Everything else is granted per section (Loads,
Planner, Fleet, CRM, Facilities, Accounting, HR, Safety, Company settings) and, for sections with tabs,
per tab. The sidebar, the tab bars, Settings' sections, the start page, the dashboard's widgets and its
Needs-attention list show only what is granted; every route checks again, so typing an address does not
get round it. Each screen is its own download, fetched the first time it is opened, so a section an
account may not open is never loaded or run; data from another section is only used where a granted
screen needs it (the planner shows loads only to accounts with Loads). Developer is only for super
admins, who always belong to Company ID 1 and have everything.

**Developer** (`/app/developer/<tab>`, super admins only; `pages/app/developer/`, `data/companies.ts`,
`data/accounts.ts`). *Account manager* lists every client company with its unique Company ID, contact,
login accounts, trucks, plan and monthly price; a row opens to the company details and its accounts,
with Edit company and + Create account for that company. *Clients* shows each company's subscription:
plan (Starter $39/truck up to 15 trucks, Growth $32/truck up to 100, Enterprise custom), billing cycle,
start, last payment, next renewal, price and status (Active, Trial, Past due, Paused, Cancelled).
*Accounts* lists every login (the owner included) with its type, company, status and last sign-in; a row
opens to what it may access, with Edit account. **Create company** (`components/CompanyDialog.tsx`,
`lib/companyStore.ts`) adds a client company in five sections — Company (name, legal name, business
type, USDOT, MC, EIN, SCAC, website), Address, Contacts, Fleet and Subscription. USDOT is required for
businesses that run trucks, MC for brokers, and neither may already belong to another client. Each
company gets a random seven-digit Company ID never issued before (`runtruck-1-company-ids`); creating a
company creates no accounts. **Create account** (`components/AccountDialog.tsx`, `lib/accountStore.ts`)
makes a login in three sections — Account (type, company, name, title, phone, notes), Login (login
email, password, status) and Access (the section checklist, with a tab checklist under each ticked
section that has tabs). Types: Super admin (always Company ID 1, everything plus Developer), Company
admin, Dispatcher, Broker / sales agent, Accounting & billing, Safety & compliance, Fleet manager, HR &
recruiting and Custom; picking one ticks its usual access, which can then be changed. Each account gets
a random ten-digit Account ID never issued before (`runtruck-1-account-ids`), and login emails are
unique. Accounts are kept in `runtruck-1-accounts`. A super admin can edit any account at any time
(type, company, details, email, a new password, status, access) or delete it; nobody can disable,
delete or demote their own account. A company can only be deleted once it has no accounts.

**Customers** (CRM; `data/customers.ts`, `components/CustomerDialogs.tsx`, `lib/customerSync.ts`; release
1.4). Customers are kept per company (`runtruck-<id>-customers`). **+ Add Customer** opens a form in five
parts: company (name, legal name, type — shipper, broker, 3PL, forwarder, manufacturer, retailer… —
industry, standing, customer since, account owner, website, and MC/USDOT for brokers, EIN), contacts (main,
shipping/dispatch, after hours), billing (bill-to, attention, billing email and phone, address, terms,
credit limit, how they pay, how invoices are sent, POD required, billing instructions), freight
(equipment, commodities, regular lanes, requirements such as appointments, hazmat, TWIC, lumpers,
food-grade, and pickup/delivery instructions) and documents (a checklist of what is on file — shipping
agreement, credit application, W-9, rate agreement, COI, routing guide — plus attached files and notes).
Every customer row opens to all of it, with open AR against the credit limit, attached documents
(attach, open, download, remove), a log, Move to inactive (with a reason) and Edit customer (which can
also delete). New Load, invoices, batches and facilities pick from active customers, and invoices use
the CRM billing details; renaming a customer renames it on its loads and invoices. **Inactive
customers** (top right) lists customers moved there by a person (with the reason, who and when) or by
RunTruck after a year with no loads or invoices (logged on the day the year passed, with the last use),
and can reactivate them; reactivating counts as use. Companies not on 1.4 keep the read-only list.

**Attaching documents** (`components/AttachDialog.tsx`, `lib/attachments.ts`). Every Attach / Replace /
Attach document button in the app opens the same popup: drag and drop files onto it or browse for them,
say what each file is when the place has document types (guessed from the file name), see size problems
before saving, then Attach. New attach buttons must use it too.

**Bills** (Accounting › Bills; `data/bills.ts`, `components/BillDialogs.tsx`; release 1.3). Bills are kept
per company (`runtruck-<id>-bills`). **+ Add Bill** opens a form in five parts: the bill (vendor, vendor
invoice #, category from a trucking list — fuel, repairs, parts, tires, insurance, leases, ELD, permits,
tolls, lumper, driver expenses, rent, utilities, software, factoring fees and more — amount, what it is
for, bill date, terms and due date, which follows the terms), **one-time or recurring** (weekly, every
two weeks, monthly, quarterly, twice a year or yearly, with an optional last date), what it is charged
to (truck, trailer, driver, load, terminal), payment (pay by, auto-pay, scheduled date, already paid,
vendor account, email, phone, remit-to) and documents and notes. Each bill opens to all its details
with Mark paid (date, amount, method, reference; a recurring bill makes its next bill then), Schedule
payment / Reschedule / Unschedule, Undo payment, Void / Restore, Stop repeating and Edit bill (which
can also delete). Documents (PDF, images, Word, Excel; up to 2 MB each) are attached to the bill and
can be opened, downloaded or removed. Status is worked out: Overdue, Due, Scheduled (scheduled or
auto-pay), Paid or Void. The dashboard's cash widget and Export data read the same bills. Companies
not on 1.3 keep the read-only list.

**Deactivated** (Developer › Deactivated; `lib/deactivate.ts`). A super admin deactivates an account
(Accounts tab, or Status in Edit account) or a whole company (Account manager); deactivating a company
deactivates all its accounts. A deactivated account cannot log in and gets no updates: it keeps the
version its company ran when it was deactivated, and deployments, redeploys and the new-companies setting
skip deactivated companies. The Deactivated tab lists every deactivated account under its company (one
expandable group per company, with when, by whom, on its own or with the company, and the version kept).
A deactivated company's group is greyed out and the company must be reactivated (there or in Account
manager) before any of its accounts can be; a reactivated account joins its company's current version.

**Releases** (Developer › Releases; `data/releases.ts`, `lib/releases.ts`). Every new or changed
feature is written up as a change in a release (`data/releases.ts`) and switched on in the code only
where `isLive('<change id>')` is true, with the old behaviour kept otherwise. Super admins (Company ID 1)
always run the newest release, so they can try changes first. Client companies stay on the release they
have until a super admin deploys: the Releases tab lists what is ready (each change marked New, Updated
or Fixed, by section), and *Deploy to paid accounts* sends it — with every earlier release not yet
deployed — to all paying companies (Active, Past due), optionally also free trials and paused companies.
Releases that have not gone out can be **merged** into one version (tick two or more, give it a number and
name; anything between them comes along, since versions go out in order) and split again until deployed.
Deploying can also set what companies created from then on start on. **Roll back / redeploy** (on any
deployed version, and in the history) lists every client company with what it runs now and after:
tick a company to send it that version (one left out the first time), untick to put it back on the
version before. Every deploy, redeploy and roll back is kept in the history with who and when
(`runtruck-1-release-state`; older `runtruck-1-deployments` records carry over). Developer shows a badge
while anything is waiting, and Clients shows each company's version. 1.0 is everything companies had when releases began; 1.1 adds
Export on Loads (a CSV of every load); 1.2 replaces it with Settings › Export data.

**Export data** (Settings › Export data; `components/ExportPanel.tsx`, `lib/exportData.ts`,
`lib/exportFiles.ts`). Exports any of 18 record sets — loads, drivers, trucks, trailers, customers,
facilities, loads to invoice, invoices, batches, settlements, bills, contracts, onboarding, maintenance,
driver documents, violations, claims and planner events — but only those the account has access to.
Each set's columns can be chosen (the app's usual columns are ticked; every other field of the record
can be added). Filters: a date range (each set says which date it uses; sets without dates come in
full), drivers, trucks and trailers, customers, text the row contains, and whether to include archived
records. File types: PDF (formatted tables, landscape or portrait), Word (.docx with a table per set),
Excel (.xlsx, a sheet per set plus a summary sheet) or CSV (one file, or a .zip of one per set). They
are real files built in the browser (the .docx/.xlsx/.zip packaging is in `lib/exportFiles.ts`). Nothing
downloads until *Review export* shows the file name, format, filters, row counts and the first rows of
each set.

**Date and time** (`lib/clock.ts`). The app runs on the real clock, in the time zone from Settings ›
Profile (or this device's): the top bar and dashboard show the live date and time, and every "today"
(planner, due dates, overdue invoices, document renewals, this week's revenue) is the real today. The
built-in demo records were written around Thursday, September 3, 2026 and are moved by the days
between then and today (`shiftDemo`), so they stay current. Untouched demo data is not saved to
storage (`usePersisted` writes only after a change), so it keeps moving; once records are edited they
keep real dates. After midnight the app reloads (when no popup is open) to roll the day over.

**Summary numbers.** Every stat box is worked out from the records when the page renders — nothing
is typed in. Revenue counts on delivery (`data/metrics.ts`: invoices by delivery date, less late
fees, plus delivered loads not yet invoiced); CRM AR is the unpaid issued invoices per customer;
driver documents and the Drivers watchlist come from the dates on each driver record
(`data/compliance.ts`: CDL, medical card, hazmat, TWIC, and the MVR review, annual review and
Clearinghouse query each due a year after the last). Figures with no history in the app yet (a
customer's loads, revenue and on-time % YTD) come from the customer rows and are summed from them.

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
