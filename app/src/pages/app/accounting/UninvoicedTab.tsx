import { useState } from 'react';
import { Card } from '../../../components/Card';
import { InvoiceDialog } from '../../../components/InvoiceDialog';
import { Kpis } from '../../../components/Kpis';
import { LoadInfoDialog } from '../../../components/LoadInfoDialog';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import { TODAY, billableLoads, daysFrom, fmtDate, usd, usd0, type BillableLoad } from '../../../data/invoicing';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

export function UninvoicedTab() {
  const { query, loads, invoices } = useAppShell();
  const [creating, setCreating] = useState<string[] | null>(null);
  const [viewing, setViewing] = useState<BillableLoad | null>(null);
  const queue = billableLoads(loads, invoices);
  const filters: FilterDef<BillableLoad>[] = [
    { key: 'customer', label: 'Customer', type: 'select', get: (l) => l.customer },
    { key: 'pod', label: 'Proof of delivery', type: 'select', get: (l) => l.pod, options: ['Attached', 'Missing'] },
    { key: 'equipment', label: 'Equipment', type: 'select', get: (l) => l.equipment },
    { key: 'delivered', label: 'Delivered', type: 'dates', get: (l) => l.delivered },
    { key: 'waiting', label: 'Days since delivery', type: 'range', get: (l) => daysFrom(l.delivered, TODAY), suffix: ' d' },
    { key: 'amount', label: 'Amount', type: 'range', get: (l) => l.amount, prefix: '$' },
  ];
  const sort = useSort(usePageFilters(queue.filter((l) => matchesQuery(l, query)), filters));
  const rows = sort.rows;

  const waiting = queue.reduce((sum, l) => sum + l.amount, 0);
  const oldest = queue.reduce<(typeof queue)[number] | null>((best, l) => (!best || l.delivered < best.delivered ? l : best), null);
  const kpis = [
    { label: 'Loads', value: String(queue.length), note: 'Delivered, not yet invoiced' },
    { label: 'Amount waiting', value: usd0(waiting), note: `Across ${new Set(queue.map((l) => l.customer)).size} customers` },
    { label: 'Missing POD', value: String(queue.filter((l) => l.pod === 'Missing').length), note: 'Attach before invoicing' },
    { label: 'Oldest (days)', value: oldest ? String(daysFrom(oldest.delivered, TODAY)) : '0', note: oldest ? `${oldest.id} · delivered ${fmtDate(oldest.delivered, true)}` : 'All caught up' },
  ];

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Delivered, not yet invoiced" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="id">Load</SortTh><SortTh sort={sort} k="customer">Customer</SortTh><SortTh sort={sort} k="route">Route</SortTh><SortTh sort={sort} k="delivered">Delivered</SortTh><SortTh sort={sort} k="pod">POD</SortTh><SortTh sort={sort} k="amount" num>Amount</SortTh><th className="num" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="strong">
                  <button type="button" className="ui-id-btn" onClick={() => setViewing(l)} aria-label={`Show load ${l.id}`}>{l.id}</button>
                </td>
                <td>{l.customer}</td>
                <td className="muted">{l.route}</td>
                <td>{fmtDate(l.delivered, true)}</td>
                <td><Tag label={l.pod} tagClass={l.pod === 'Missing' ? 'tag-outline' : 'tag-green'} /></td>
                <td className="num">{usd(l.amount)}</td>
                <td className="num">
                  <button type="button" className="ui-btn ui-btn-sm" onClick={() => setCreating([l.id])}>New invoice</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{queue.length ? 'Nothing matches the search or filters.' : 'Every delivered load has an invoice.'}</div>}
      </Card>

      {viewing && <LoadInfoDialog load={viewing} onInvoice={() => setCreating([viewing.id])} onClose={() => setViewing(null)} />}
      {creating && <InvoiceDialog loadIds={creating} onClose={() => setCreating(null)} />}
    </>
  );
}
