// RunTruck's releases: what each version adds or changes. Super admins
// (Company ID 1) always run the newest code, so they can try it first; a
// client company only gets a release once a super admin deploys it in
// Developer › Releases.
//
// How to ship a change:
// 1. Add it to a release below (a new release at the end of the list, or
//    the newest one if that is not deployed yet), with a unique change id.
// 2. In the code, show the new or changed behaviour only where
//    isLive('<change id>') is true (lib/releases.ts), and keep the old
//    behaviour otherwise, so companies that have not received the release
//    keep working exactly as before.
// 3. Once it is deployed to every company, the check can be removed in a
//    later clean-up (the entry stays here as history).

export type ChangeKind = 'New' | 'Updated' | 'Fixed';

export interface Change {
  id: string;
  kind: ChangeKind;
  section: string;
  title: string;
  details: string;
}

export interface Release {
  id: string;
  date: string;
  title: string;
  // The release every company already had when releases began: live for all.
  baseline?: boolean;
  changes: Change[];
}

export const RELEASES: Release[] = [
  {
    id: '1.0',
    date: '2026-10-01',
    title: 'RunTruck as every company has it today',
    baseline: true,
    changes: [
      { id: 'base-loads', kind: 'New', section: 'Loads', title: 'Load board and load details', details: 'New Load form, editing, status, stops and documents.' },
      { id: 'base-planner', kind: 'New', section: 'Planner', title: 'Planner calendar', details: 'Day, week and month views with loads and events.' },
      { id: 'base-fleet', kind: 'New', section: 'Fleet', title: 'Drivers, trucks and trailers', details: 'Full records with archive and delete.' },
      { id: 'base-facilities', kind: 'New', section: 'Facilities', title: 'Facility register', details: 'Shippers, receivers, yards and truck stops.' },
      { id: 'base-accounting', kind: 'New', section: 'Accounting', title: 'Invoicing', details: 'Invoices with PDF, batches, past-due reminders and late fees.' },
      { id: 'base-dashboard', kind: 'New', section: 'Dashboard', title: 'Customizable dashboard', details: 'Live numbers, charts and resizable widgets.' },
      { id: 'base-settings', kind: 'New', section: 'Settings', title: 'Settings, login and accounts', details: 'Company settings, filters and sorting on every table, permissions per account.' },
    ],
  },
  {
    id: '1.1',
    date: '2026-10-01',
    title: 'Export loads',
    changes: [
      {
        id: 'loads-export', kind: 'New', section: 'Loads', title: 'Export loads to a spreadsheet',
        details: 'An Export button on Loads downloads every load as a CSV file that opens in Excel or Google Sheets.',
      },
    ],
  },
  {
    id: '1.2',
    date: '2026-10-01',
    title: 'Export data from Settings',
    changes: [
      {
        id: 'settings-export', kind: 'New', section: 'Settings', title: 'Export data',
        details: 'Settings › Export data downloads any records the account can open (loads, fleet, customers, facilities, accounting, HR, safety, planner), filtered by dates, drivers, units, customers or text, with a choice of columns, as PDF, Word, Excel or CSV, after a review step.',
      },
      {
        id: 'loads-export-moved', kind: 'Updated', section: 'Loads', title: 'Export moves to Settings',
        details: 'The Export button on Loads is replaced by Settings › Export data.',
      },
    ],
  },
  {
    id: '1.3',
    date: '2026-10-01',
    title: 'Bills',
    changes: [
      {
        id: 'bills-manage', kind: 'New', section: 'Accounting', title: 'Manage bills',
        details: 'Each bill on Accounting › Bills opens to every detail, with Edit bill, Mark paid, Schedule payment, Void and Undo payment, and documents (vendor invoices, receipts, contracts) attached to the bill.',
      },
      {
        id: 'bills-add', kind: 'New', section: 'Accounting', title: 'Add Bill form, one-time or recurring',
        details: '+ Add Bill opens a form for the vendor, invoice #, category, amount, dates and terms, what it is charged to (truck, trailer, driver, load, terminal), payment and documents. Recurring bills (weekly to yearly, with an optional end date) make the next bill when one is paid.',
      },
    ],
  },
];

export const releaseIndex = (id: string) => RELEASES.findIndex((r) => r.id === id);
export const BASELINE = RELEASES.find((r) => r.baseline) ?? RELEASES[0];
export const LATEST = RELEASES[RELEASES.length - 1];

// The release a change belongs to.
export function releaseOf(changeId: string): Release | undefined {
  return RELEASES.find((r) => r.changes.some((c) => c.id === changeId));
}
