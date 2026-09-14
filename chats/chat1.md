# Trucking CRM Frontend Design

_Started 2026-09-03 21:44 UTC_

---

## User

Can you make me a frontend for a multi tenant CRM software I am trying to build for trucking companies. You can reference https://www.datatruck.io/ for what information to add on the website. Make it looks simple and easy to understand.

## Assistant



## Assistant

I'll look at the reference site first.

_[tool: ask_user]_

_[tool: web_fetch]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

Built the app UI (not the marketing site) since that's the frontend you'd actually be coding against — "Haulyard", a multi-tenant TMS/CRM.

- **Tenant switcher** top-left: three workspaces (two carriers, one broker) with their own loads, drivers, trucks, customers, invoices, users — plus a **Platform admin** view listing all tenants.
- Screens: Today dashboard (KPIs, needs-attention queue, revenue, driver availability), Loads board with status tabs + search, load detail drawer (stops, pay breakdown, documents), Drivers, Trucks, Customers, Invoicing/AR aging, Settings with roles.
- Tweaks panel: accent color, row density, hide platform admin.

Say the word if you want the marketing site next, or want me to swap in your real product name and terminology.

## User

Answered — deliverable: Both — app UI first, marketing site after; design_system: Picked a design system (now attached); primary_user: Dispatcher (assigning loads to drivers), Owner/operator (small fleet, sees everything), Accounting/back office, Broker booking loads with carriers; screens: Dashboard / KPIs, Load detail + tracking, Drivers, Trucks & trailers, Customers (CRM), Invoicing & settlements; tenancy: Keep it invisible; density: Airy & simple; interactivity: Static screens; variations: 2 visual directions; brand: RunTruck

## Assistant

_[tool: list_files]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: copy_files]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

Rebuilt as **RunTruck** on the Industry design system, in two directions on one pan/zoom canvas — dashboard + load detail each, airy and static, no tenant switching visible:

- **1a Blueprint board** — all-paper ground, every card/table/button a hairline frame with registration marks, load facts as a five-cell spec strip.
- **1b Steel rail** — deep steel navigation field with reversed type, KPIs as one shaded spec plate, section rules instead of frames, split-pane load detail with a map placeholder.

Tell me which one and I'll build Drivers, Trucks & trailers, Customers, and Invoicing & settlements in it — then the marketing site. The earlier `Trucking CRM.dc.html` is left as-is.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Fixed 1b's clipped load detail — the facts plate is now a single 5-up spec row and the right column's padding/gaps are tighter, so everything fits inside the frame.

## User

I like 1b more

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

Built out **1b Steel rail** across all six screens in `RunTruck App.dc.html` — dashboard, load detail & tracking, drivers (roster + compliance watchlist + miles bars), trucks & trailers (power-unit table + trailer cells), customers (top accounts + account table), invoicing & settlements (AR aging plate, invoice table, driver settlement run).

`RunTruck.dc.html` stays as the 1a/1b comparison. Want me to start the marketing site next?

## User

yes

## Assistant

_[tool: read_file]_

_[tool: copy_starter_component]_

_[tool: dc_write]_

_[tool: ready_for_verification]_

`RunTruck Site.dc.html` — marketing page in the same Industry grammar: condensed hero, an operating-data spec plate, six wireframe feature cells, a four-column "who it's for" band, duotone photo split (drop your own image on it), a quote, three pricing plans, FAQ, and a trial signup close.

Copy is TMS-standard but written fresh — swap in your real numbers before it goes anywhere public.

## User

Can you turn the app into a functioning website?

## Assistant

_[tool: dc_write]_

_[tool: ready_for_verification]_

`RunTruck Live.dc.html` — the same screens, now a working app in one viewport.

What functions: sidebar routing with counts, search across loads/customers/drivers, load status tabs, clicking any load row opens its detail (real per-load stops, freight, pay, docs, activity) with a back button, driver filters, settlement approval that updates statuses and the net total, KPI tiles that jump to the relevant screen. View persists across reload.

The flat 1440-wide screen set stays in `RunTruck App.dc.html`.

## User

Found issues — fixing…

## Assistant

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: ready_for_verification]_

Fixed the overflow: every table now sits in a `min-width:0; overflow-x:auto` wrapper, the two-column splits stack below ~400–420px of column width instead of forcing the table wider than its track, the dashboard summary drops the Driver column, and the trailer/account grids auto-fit. Renamed the dashboard loop's binding so it no longer collides with the loads-view holes.

