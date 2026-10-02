import { Fragment, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { downloadDocument, openDocument, readAttachment } from '../../components/BillDialogs';
import { Card } from '../../components/Card';
import { CustomerDialog } from '../../components/CustomerDialogs';
import { CustomerDocsDialog } from '../../components/CustomerDocs';
import { Kpis } from '../../components/Kpis';
import { Tag } from '../../components/Tag';
import { useAppShell } from '../../context/AppShellContext';
import {
  AUTO_BY, CUSTOMER_TYPES, ON_FILE, STANDINGS, STANDING_TAG, dayOf, lastInactive, usageOf, type CustomerRecord,
} from '../../data/customers';
import { BILLING, fmtDate, invoiceTotal, statusOf, usd0 } from '../../data/invoicing';
import { compactUsd } from '../../data/metrics';
import { CUSTOMERS, USER } from '../../data/mock';
import { todayIso } from '../../lib/clock';
import { isLive } from '../../lib/releases';
import { matchesQuery } from '../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../lib/tableTools';

// '$412K' → 412000; '96%' → 96.
const amount = (s: string) => (Number(s.replace(/[^\d.]/g, '')) || 0) * (/K$/i.test(s) ? 1000 : /M$/i.test(s) ? 1_000_000 : 1);
const pct = (s: string) => Number(s.replace(/[^\d.]/g, '')) || 0;
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

// Release 1.4 (data/releases.ts) brings customer management; companies that
// have not received it keep the read-only list.
export function CustomersPage() {
  return isLive('crm-customers') ? <CustomerManager /> : <CustomerList />;
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children || '—'}</div>
    </div>
  );
}

// — 1.4 —

function CustomerManager() {
  const { query, invoices, loads, customers, saveCustomer } = useAppShell();
  const [params] = useSearchParams();
  const showInactive = params.get('view') === 'inactive';
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [viewingDocs, setViewingDocs] = useState<CustomerRecord | null>(null);
  // Attaching straight from an On file chip: which customer and document.
  const fileInput = useRef<HTMLInputElement>(null);
  const [attachFor, setAttachFor] = useState<{ id: string; kind: string } | null>(null);
  const today = todayIso();
  const year = today.slice(0, 4);

  const open = invoices.filter((i) => !i.draft && !i.paid);
  const arOf = (name: string) => open.filter((i) => i.customer === name).reduce((s, i) => s + invoiceTotal(i), 0);
  const pastDueOf = (name: string) => open.filter((i) => i.customer === name && statusOf(i) === 'Overdue').length;
  // Loads and revenue: history from before RunTruck plus loads added here since.
  const newLoads = (c: CustomerRecord) => loads.filter((l) => l.customer === c.name && l.createdAt && l.createdAt > c.created);
  const rows0 = customers.map((c) => {
    const added = newLoads(c);
    const usage = usageOf(c, loads, invoices, year);
    return {
      ...c,
      loadsYtd: (c.history?.loads ?? 0) + added.length,
      revenueYtd: (c.history?.revenue ?? 0) + added.reduce((s, l) => s + (Number(l.rate.replace(/[$,]/g, '')) || 0), 0),
      onTimePct: c.history?.onTime ?? null,
      arValue: arOf(c.name),
      pastDue: pastDueOf(c.name),
      lastUsed: usage.lastUsed,
      lastWhy: usage.why,
      inactiveEntry: lastInactive(c),
    };
  });
  type Row = (typeof rows0)[number];
  const active = rows0.filter((c) => c.status === 'Active');
  const inactive = rows0.filter((c) => c.status === 'Inactive');
  const list = showInactive ? inactive : active;

  const revenue = active.reduce((s, c) => s + c.revenueYtd, 0);
  const top3 = [...active].sort((a, b) => b.revenueYtd - a.revenueYtd).slice(0, 3);
  const loadsYtd = active.reduce((s, c) => s + c.loadsYtd, 0);
  const rated = active.filter((c) => c.onTimePct !== null);
  const ratedLoads = rated.reduce((s, c) => s + c.loadsYtd, 0);
  const onTime = ratedLoads ? rated.reduce((s, c) => s + (c.onTimePct ?? 0) * c.loadsYtd, 0) / ratedLoads : 0;
  const pastDueAccounts = active.filter((c) => c.pastDue > 0);
  const overLimit = active.filter((c) => c.creditLimit > 0 && c.arValue > c.creditLimit);
  const kpis = showInactive
    ? [
        { label: 'Inactive customers', value: String(inactive.length), note: 'Kept on file; not in pickers' },
        { label: 'Moved by a person', value: String(inactive.filter((c) => c.inactiveEntry && c.inactiveEntry.by !== AUTO_BY).length), note: 'With the reason they gave' },
        { label: 'Not used for a year', value: String(inactive.filter((c) => c.inactiveEntry?.by === AUTO_BY).length), note: 'Moved by RunTruck' },
      ]
    : [
        { label: 'Accounts', value: String(active.length), note: `${active.filter((c) => c.standing === 'Key account').length} key accounts · ${active.filter((c) => c.standing === 'At risk').length} at risk` },
        { label: 'Revenue YTD', value: compactUsd(revenue), note: `Top 3 accounts = ${revenue ? Math.round((top3.reduce((s, c) => s + c.revenueYtd, 0) / revenue) * 100) : 0}%` },
        { label: 'On time', value: ratedLoads ? `${Math.round(onTime)}%` : '—', note: `Weighted by ${loadsYtd.toLocaleString('en-US')} loads YTD` },
        { label: 'Open AR', value: compactUsd(active.reduce((s, c) => s + c.arValue, 0)), note: `${pastDueAccounts.length} past due · ${overLimit.length} over credit limit` },
      ];

  const filters: FilterDef<Row>[] = [
    { key: 'standing', label: 'Standing', type: 'select', get: (c) => c.standing, options: STANDINGS },
    { key: 'type', label: 'Customer type', type: 'select', get: (c) => c.type, options: CUSTOMER_TYPES },
    { key: 'terms', label: 'Terms', type: 'select', get: (c) => c.terms },
    { key: 'state', label: 'State', type: 'select', get: (c) => c.state },
    { key: 'equipment', label: 'Equipment', type: 'select', get: (c) => c.equipment },
    { key: 'pastDue', label: 'Past due', type: 'toggle', get: (c) => c.pastDue > 0, hint: 'Only accounts with past-due invoices' },
    { key: 'ar', label: 'AR balance', type: 'range', get: (c) => c.arValue, prefix: '$' },
    { key: 'lastUsed', label: 'Last used', type: 'dates', get: (c) => c.lastUsed },
  ];
  const sort = useSort(
    usePageFilters(list.filter((c) => matchesQuery({ ...c, documents: c.documents.map((d) => d.name).join(' '), log: '' }, query)), filters),
    { loads: (c) => c.loadsYtd, revenue: (c) => c.revenueYtd, onTime: (c) => c.onTimePct, ar: (c) => c.arValue, tier: (c) => STANDINGS.indexOf(c.standing), moved: (c) => c.inactiveEntry?.at ?? '' },
  );
  const rows = sort.rows;

  const reactivate = (c: CustomerRecord) => {
    if (!window.confirm(`Reactivate ${c.name}? It goes back to the customer list and pickers.`)) return;
    const now = new Date().toISOString();
    saveCustomer({ ...c, status: 'Active', updated: now, log: [...c.log, { at: now, by: USER.name, action: 'Reactivated', reason: 'Reactivated by a user' }] });
  };

  // Everything about one customer, under its row.
  const details = (c: Row) => (
    <div className="ui-batch">
      <div className="ui-batch-head">
        <div className="ui-stop-meta" style={{ marginTop: 0 }}>{c.id} · last used {fmtDate(c.lastUsed)} ({c.lastWhy})</div>
        <div style={{ flex: 1 }} />
        {c.status === 'Inactive' && <button type="button" className="ui-btn ui-btn-sm ui-btn-primary" onClick={() => reactivate(c)}>Reactivate</button>}
        <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(customers.find((x) => x.id === c.id) ?? null)}>Edit customer</button>
      </div>
      <div className="ui-kv-grid dev-facts">
        <Fact k="Legal name">{c.legalName}</Fact>
        <Fact k="Type · industry">{[c.type, c.industry].filter(Boolean).join(' · ')}</Fact>
        <Fact k="Customer since">{c.since ? fmtDate(c.since) : ''}</Fact>
        <Fact k="Account owner">{c.salesRep}</Fact>
        <Fact k="Main contact">{[c.contact, c.contactTitle].filter(Boolean).join(', ')}<div className="ui-stop-meta">{[c.email, c.phone].filter(Boolean).join(' · ')}</div></Fact>
        <Fact k="Shipping contact">{(c.shippingContact || c.shippingPhone || c.afterHoursPhone) && <>{c.shippingContact}<div className="ui-stop-meta">{[c.shippingPhone, c.afterHoursPhone && `After hours ${c.afterHoursPhone}`].filter(Boolean).join(' · ')}</div></>}</Fact>
        <Fact k="Bill to">{[c.billTo, c.attn].filter(Boolean).join(' · ')}<div className="ui-stop-meta">{[c.street, c.city, [c.state, c.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</div></Fact>
        <Fact k="Billing contact">{[c.billingEmail, c.billingPhone].filter(Boolean).join(' · ')}<div className="ui-stop-meta">Invoices by {c.invoiceDelivery.toLowerCase()}{c.podRequired ? ' · POD required' : ''}</div></Fact>
        <Fact k="Terms · credit">
          {c.terms} · {c.creditLimit ? `limit ${usd0(c.creditLimit)}` : 'no limit set'}
          <div className="ui-stop-meta" style={c.creditLimit && c.arValue > c.creditLimit ? { color: 'var(--ui-red)' } : undefined}>
            Open AR {usd0(c.arValue)}{c.creditLimit ? ` (${Math.round((c.arValue / c.creditLimit) * 100)}% of limit)` : ''} · pays by {c.payMethod}
          </div>
        </Fact>
        <Fact k="Authority">{[c.mc && `MC ${c.mc}`, c.dot && `USDOT ${c.dot}`, c.ein && `EIN ${c.ein}`].filter(Boolean).join(' · ')}</Fact>
        <Fact k="Freight">{(c.equipment.length > 0 || c.commodities || c.lanes) && <>{[c.equipment.join(', '), c.commodities].filter(Boolean).join(' · ')}<div className="ui-stop-meta">{c.lanes}</div></>}</Fact>
        <Fact k="Requirements">{(c.needs.length > 0 || c.instructions) && <>{c.needs.join(', ')}<div className="ui-stop-meta">{c.instructions}</div></>}</Fact>
        {c.invoiceInstructions && <Fact k="Billing instructions">{c.invoiceInstructions}</Fact>}
        {c.website && <Fact k="Website">{c.website}</Fact>}
        {c.notes && <Fact k="Notes">{c.notes}</Fact>}
      </div>
      <div className="crm-onfile">
        <span className="ui-label">On file</span>
        {ON_FILE.map((kind) => {
          const doc = c.documents.find((d) => d.kind === kind);
          const on = Boolean(doc) || c.onFile.includes(kind);
          return doc ? (
            <span key={kind} className="acc-perm is-on crm-chip has-file">
              <button type="button" className="crm-chip-open" title={`Open ${doc.name}`} onClick={() => { void openDocument(doc); }}>{kind}</button>
              <button type="button" className="crm-chip-dl" title={`Download ${doc.name}`} aria-label={`Download ${doc.name}`} onClick={() => downloadDocument(doc)}>⤓</button>
            </span>
          ) : (
            <button
              key={kind} type="button" className={`acc-perm crm-chip${on ? ' is-on' : ''}`}
              title={on ? 'Paper copy on file. Click to attach a scan.' : 'Not on file. Click to attach it.'}
              onClick={() => { setAttachFor({ id: c.id, kind }); setTimeout(() => fileInput.current?.click(), 0); }}
            >
              {kind}{on ? '' : ' +'}
            </button>
          );
        })}
        <button type="button" className="ui-btn ui-btn-sm crm-viewall" onClick={() => setViewingDocs(customers.find((x) => x.id === c.id) ?? null)}>
          View all documents{c.documents.length ? ` (${c.documents.length})` : ''}
        </button>
      </div>
      <div>
        <div className="ui-label" style={{ marginBottom: 6 }}>Log</div>
        <ul className="crm-log">
          {[...c.log].reverse().map((e, i) => (
            <li key={i} className={e.action === 'Moved to inactive' ? 'is-off' : e.action === 'Reactivated' ? 'is-on' : ''}>
              <strong>{e.action}</strong>
              <span>{e.reason}</span>
              <span className="ui-stop-meta" style={{ marginTop: 0 }}>{e.by === AUTO_BY ? fmtDate(dayOf(e.at)) : when(e.at)} · {e.by}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  return (
    <>
      <Kpis items={kpis} />

      {!showInactive && (
        <div className="ui-grid-3">
          {top3.map((a, i) => (
            <Card key={a.id}>
              <div className="ui-label" style={{ color: 'var(--ui-primary)' }}>#{i + 1} by revenue · {a.standing}</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{a.name}</div>
              <div style={{ fontSize: 13, color: 'var(--ui-muted)', marginTop: 2 }}>{[a.contact, a.billingEmail].filter(Boolean).join(' · ')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--ui-border)' }}>
                {[['Loads', a.loadsYtd.toLocaleString('en-US')], ['Revenue', compactUsd(a.revenueYtd)], ['On time', a.onTimePct === null ? '—' : `${a.onTimePct}%`]].map(([k, v]) => (
                  <div key={k}>
                    <div className="ui-label">{k}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card title={showInactive ? 'Inactive customers' : 'All accounts'} flush>
        <table className="ui-table">
          <thead>
            {showInactive ? (
              <tr>
                <SortTh sort={sort} k="name">Customer</SortTh><SortTh sort={sort} k="contact">Primary contact</SortTh><SortTh sort={sort} k="moved">Moved to inactive</SortTh>
                <th>Why</th><th>By</th><SortTh sort={sort} k="lastUsed">Last used</SortTh><th className="num" aria-label="Actions" />
              </tr>
            ) : (
              <tr>
                <SortTh sort={sort} k="name">Customer</SortTh><SortTh sort={sort} k="contact">Primary contact</SortTh><SortTh sort={sort} k="loads" num>Loads YTD</SortTh><SortTh sort={sort} k="revenue" num>Revenue</SortTh>
                <SortTh sort={sort} k="onTime" num>On time</SortTh><SortTh sort={sort} k="terms" num>Terms</SortTh><SortTh sort={sort} k="ar" num>AR balance</SortTh><SortTh sort={sort} k="tier" num>Standing</SortTh>
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((c) => {
              const isOpen = openId === c.id;
              const cols = showInactive ? 7 : 8;
              return (
                <Fragment key={c.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}`} onClick={() => setOpenId(isOpen ? null : c.id)} aria-expanded={isOpen}>
                    <td className="strong">{c.name}<div className="ui-stop-meta">{[c.type, c.city && `${c.city}, ${c.state}`].filter(Boolean).join(' · ')}</div></td>
                    <td className="muted">{c.contact}</td>
                    {showInactive ? (
                      <>
                        <td>{c.inactiveEntry ? fmtDate(dayOf(c.inactiveEntry.at)) : '—'}</td>
                        <td>{c.inactiveEntry?.reason ?? '—'}</td>
                        <td>{c.inactiveEntry ? (c.inactiveEntry.by === AUTO_BY ? <Tag label="Automatic · 1 year unused" tagClass="tag-outline" /> : c.inactiveEntry.by) : '—'}</td>
                        <td>{fmtDate(c.lastUsed)}</td>
                        <td className="num"><button type="button" className="ui-btn ui-btn-sm" onClick={(e) => { e.stopPropagation(); reactivate(c); }}>Reactivate</button></td>
                      </>
                    ) : (
                      <>
                        <td className="num">{c.loadsYtd.toLocaleString('en-US')}</td>
                        <td className="num">{compactUsd(c.revenueYtd)}</td>
                        <td className="num">{c.onTimePct === null ? '—' : `${c.onTimePct}%`}</td>
                        <td className="num">{c.terms}</td>
                        <td className="num">{usd0(c.arValue)}{c.pastDue > 0 && <div className="ui-stop-meta" style={{ color: 'var(--ui-red)' }}>{c.pastDue} past due</div>}</td>
                        <td className="num"><Tag label={c.standing} tagClass={STANDING_TAG[c.standing]} /></td>
                      </>
                    )}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={cols} className="ui-expand-cell">{details(c)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="ui-empty">
            {list.length > 0 ? 'Nothing matches the search or filters.' : showInactive ? 'No inactive customers. Customers move here when someone moves them, or after a year without loads or invoices.' : 'No customers yet. + Add Customer adds the first one.'}
          </div>
        )}
      </Card>

      {editing && <CustomerDialog customer={editing} onClose={() => setEditing(null)} />}
      {viewingDocs && <CustomerDocsDialog customer={viewingDocs} onClose={() => setViewingDocs(null)} />}
      <input
        ref={fileInput} type="file" hidden accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          const target = attachFor && customers.find((x) => x.id === attachFor.id);
          e.target.value = '';
          if (!f || !target || !attachFor) return;
          const doc = await readAttachment(f, attachFor.kind);
          if (typeof doc === 'string') { window.alert(`${doc} is over 2 MB. Attach a smaller copy.`); return; }
          saveCustomer({
            ...target, updated: new Date().toISOString(),
            documents: [...target.documents.filter((d) => d.kind !== attachFor.kind), doc],
            onFile: target.onFile.includes(attachFor.kind) ? target.onFile : [...target.onFile, attachFor.kind],
          });
        }}
      />
    </>
  );
}

// — before 1.4: the read-only list —

function CustomerList() {
  const { query, invoices } = useAppShell();

  // AR = issued invoices not yet paid, from Accounting.
  const open = invoices.filter((i) => !i.draft && !i.paid);
  const arOf = (name: string) => open.filter((i) => i.customer === name).reduce((s, i) => s + invoiceTotal(i), 0);
  const pastDueOf = (name: string) => open.filter((i) => i.customer === name && statusOf(i) === 'Overdue').length;
  const accounts = CUSTOMERS.map((c) => ({ ...c, ar: usd0(arOf(c.name)), arValue: arOf(c.name), pastDue: pastDueOf(c.name) }));

  const revenue = accounts.reduce((s, c) => s + amount(c.revenue), 0);
  const top3 = [...accounts].sort((a, b) => amount(b.revenue) - amount(a.revenue)).slice(0, 3);
  const loadsYtd = accounts.reduce((s, c) => s + pct(c.loads), 0);
  const onTime = loadsYtd ? accounts.reduce((s, c) => s + pct(c.onTime) * pct(c.loads), 0) / loadsYtd : 0;
  const pastDueAccounts = accounts.filter((c) => c.pastDue > 0);
  const kpis = [
    { label: 'Accounts', value: String(accounts.length), note: `${accounts.filter((c) => c.tier === 'Key account').length} key accounts · ${accounts.filter((c) => c.tier === 'At risk').length} at risk` },
    { label: 'Revenue YTD', value: compactUsd(revenue), note: `Top 3 accounts = ${revenue ? Math.round((top3.reduce((s, c) => s + amount(c.revenue), 0) / revenue) * 100) : 0}%` },
    { label: 'On time', value: `${Math.round(onTime)}%`, note: `Weighted by ${loadsYtd.toLocaleString('en-US')} loads YTD` },
    { label: 'Open AR', value: compactUsd(accounts.reduce((s, c) => s + c.arValue, 0)), note: `${open.length} unpaid invoices · ${pastDueAccounts.length} account(s) past due` },
  ];
  type Account = (typeof accounts)[number];
  const filters: FilterDef<Account>[] = [
    { key: 'tier', label: 'Standing', type: 'select', get: (c) => c.tier },
    { key: 'terms', label: 'Terms', type: 'select', get: (c) => c.terms },
    { key: 'pastDue', label: 'Past due', type: 'toggle', get: (c) => c.pastDue > 0, hint: 'Only accounts with past-due invoices' },
    { key: 'ar', label: 'AR balance', type: 'range', get: (c) => c.arValue, prefix: '$' },
    { key: 'onTime', label: 'On time', type: 'range', get: (c) => pct(c.onTime), suffix: '%' },
  ];
  const sort = useSort(usePageFilters(accounts.filter((c) => matchesQuery(c, query)), filters), { ar: (c) => c.arValue });
  const rows = sort.rows;

  return (
    <>
      <Kpis items={kpis} />

      <div className="ui-grid-3">
        {top3.map((a, i) => (
          <Card key={a.name}>
            <div className="ui-label" style={{ color: 'var(--ui-primary)' }}>#{i + 1} by revenue · {a.tier}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{a.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ui-muted)', marginTop: 2 }}>{[a.contact, BILLING[a.name]?.email].filter(Boolean).join(' · ')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--ui-border)' }}>
              {[['Loads', a.loads], ['Revenue', a.revenue], ['On time', a.onTime]].map(([k, v]) => (
                <div key={k}>
                  <div className="ui-label">{k}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{v}</div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card title="All accounts" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="name">Customer</SortTh><SortTh sort={sort} k="contact">Primary contact</SortTh><SortTh sort={sort} k="loads" num>Loads YTD</SortTh><SortTh sort={sort} k="revenue" num>Revenue</SortTh>
              <SortTh sort={sort} k="onTime" num>On time</SortTh><SortTh sort={sort} k="terms" num>Terms</SortTh><SortTh sort={sort} k="ar" num>AR balance</SortTh><SortTh sort={sort} k="tier" num>Standing</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.name}>
                <td className="strong">{c.name}</td>
                <td className="muted">{c.contact}</td>
                <td className="num">{c.loads}</td>
                <td className="num">{c.revenue}</td>
                <td className="num">{c.onTime}</td>
                <td className="num">{c.terms}</td>
                <td className="num">{c.ar}{c.pastDue > 0 && <div className="ui-stop-meta" style={{ color: 'var(--ui-red)' }}>{c.pastDue} past due</div>}</td>
                <td className="num"><Tag label={c.tier} tagClass={c.tagClass} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">Nothing matches the search or filters.</div>}
      </Card>
    </>
  );
}
