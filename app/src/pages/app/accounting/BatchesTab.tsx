import { Fragment, useState } from 'react';
import { BatchDialog } from '../../../components/BatchDialog';
import { Card } from '../../../components/Card';
import { InvoiceDialog } from '../../../components/InvoiceDialog';
import { Kpis } from '../../../components/Kpis';
import { ConfirmDialog } from '../../../components/RecordDialog';
import { Tag } from '../../../components/Tag';
import { useAppShell } from '../../../context/AppShellContext';
import {
  BATCH_TAG, STATUS_TAG, TODAY, batchStatus, batchTotal, daysFrom, fmtDate, invoiceTotal, statusOf, usd, usd0, type Batch, type InvoiceRecord,
} from '../../../data/invoicing';
import { combinedDoc, invoiceDoc, invoiceFileName } from '../../../lib/invoicePdf';
import { downloadPdf } from '../../../lib/pdf';
import { matchesQuery } from '../../../lib/search';
import { SortTh, useSort, usePageFilters, type FilterDef } from '../../../lib/tableTools';

export function BatchesTab() {
  const { query, batches, invoices, saveBatch, deleteBatch } = useAppShell();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [deleting, setDeleting] = useState<Batch | null>(null);
  const [viewing, setViewing] = useState<InvoiceRecord | null>(null);

  const sorted = [...batches].sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : b.id.localeCompare(a.id)));
  const ready = sorted.filter((b) => batchStatus(b, invoices) === 'Ready');
  const kpis = [
    { label: 'Batches', value: String(batches.length), note: `${batches.reduce((n, b) => n + b.invoiceIds.length, 0)} invoices` },
    { label: 'Ready to send', value: String(ready.length), note: `${usd0(ready.reduce((s, b) => s + batchTotal(b, invoices), 0))} to go out` },
    { label: 'Sent this week', value: String(sorted.filter((b) => b.sentOn && daysFrom(b.sentOn, TODAY) < 7).length), note: 'Last 7 days' },
    { label: 'Total batched', value: usd0(batches.reduce((s, b) => s + batchTotal(b, invoices), 0)), note: 'Ready, sent and settled' },
  ];
  const filters: FilterDef<Batch>[] = [
    { key: 'status', label: 'Status', type: 'select', get: (b) => batchStatus(b, invoices), options: ['Ready', 'Sent', 'Settled'] },
    { key: 'recipient', label: 'Sent to', type: 'select', get: (b) => b.recipient },
    { key: 'method', label: 'How it is sent', type: 'select', get: (b) => b.method },
    { key: 'created', label: 'Created', type: 'dates', get: (b) => b.created },
    { key: 'total', label: 'Total', type: 'range', get: (b) => batchTotal(b, invoices), prefix: '$' },
  ];
  const sort = useSort(usePageFilters(sorted.filter((b) => matchesQuery({ ...b, invoices: b.invoiceIds.join(' ') }, query)), filters), {
    count: (b) => b.invoiceIds.length, total: (b) => batchTotal(b, invoices), status: (b) => batchStatus(b, invoices),
  });
  const rows = sort.rows;
  const members = (b: Batch) => invoices.filter((i) => b.invoiceIds.includes(i.id));

  return (
    <>
      <Kpis items={kpis} />

      <Card title="Invoice batches" flush>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="id">Batch</SortTh><SortTh sort={sort} k="created">Created</SortTh><SortTh sort={sort} k="count" num>Invoices</SortTh><SortTh sort={sort} k="recipient">Sent to</SortTh><SortTh sort={sort} k="method">How</SortTh>
              <SortTh sort={sort} k="total" num>Total</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const isOpen = openId === b.id;
              const st = batchStatus(b, invoices);
              const list = members(b);
              return (
                <Fragment key={b.id}>
                  <tr className={`is-clickable${isOpen ? ' is-open' : ''}`} onClick={() => setOpenId(isOpen ? null : b.id)} aria-expanded={isOpen}>
                    <td className="strong"><span className="ui-caret" aria-hidden>{isOpen ? '▾' : '▸'}</span> {b.id}</td>
                    <td>{fmtDate(b.created, true)}</td>
                    <td className="num">{b.invoiceIds.length}</td>
                    <td>{b.recipient}</td>
                    <td className="muted">{b.method}</td>
                    <td className="num">{usd(batchTotal(b, invoices))}</td>
                    <td className="num"><Tag label={st} tagClass={BATCH_TAG[st]} /></td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={7} className="ui-expand-cell">
                        <div className="ui-batch">
                          <div className="ui-batch-head">
                            <div className="ui-stop-meta" style={{ marginTop: 0 }}>
                              {st === 'Ready' ? 'Not sent yet' : b.sentOn ? `Sent ${fmtDate(b.sentOn)}` : ''}{b.notes ? ` · ${b.notes}` : ''}
                            </div>
                            <div style={{ flex: 1 }} />
                            {st === 'Ready' && (
                              <button type="button" className="ui-btn ui-btn-sm" onClick={() => saveBatch({ ...b, sentOn: TODAY })}>Mark as sent</button>
                            )}
                            <button type="button" className="ui-btn ui-btn-sm" disabled={list.length === 0} onClick={() => downloadPdf(combinedDoc(`Batch ${b.id}`, list), `${b.id} invoices.pdf`)}>Download batch PDF</button>
                            <button type="button" className="ui-btn ui-btn-sm" onClick={() => setEditing(b)}>Edit batch</button>
                            <button type="button" className="ui-btn ui-btn-sm ui-btn-danger" onClick={() => setDeleting(b)}>Delete batch</button>
                          </div>
                          <table className="ui-table ui-table-inner">
                            <thead>
                              <tr><th>Invoice</th><th>Customer</th><th>Load</th><th>Issued</th><th>Due</th><th>Status</th><th className="num">Amount</th><th className="num" aria-label="Actions" /></tr>
                            </thead>
                            <tbody>
                              {list.map((i) => {
                                const s = statusOf(i);
                                return (
                                  <tr key={i.id}>
                                    <td className="strong">{i.id}</td>
                                    <td>{i.customer}</td>
                                    <td className="muted">{i.loads.join(', ')}</td>
                                    <td>{fmtDate(i.issued, true)}</td>
                                    <td>{fmtDate(i.due, true)}</td>
                                    <td><Tag label={s} tagClass={STATUS_TAG[s]} /></td>
                                    <td className="num">{usd(invoiceTotal(i))}</td>
                                    <td className="num">
                                      <span className="ui-link-row">
                                        <button type="button" className="ui-link" onClick={() => setViewing(i)}>Open</button>
                                        <button type="button" className="ui-link" onClick={() => downloadPdf(invoiceDoc(i), invoiceFileName(i))}>PDF</button>
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {list.length === 0 && <div className="ui-empty" style={{ padding: 20 }}>This batch has no invoices. Edit it to add some, or delete it.</div>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="ui-empty">{batches.length ? 'Nothing matches the search or filters.' : 'No batches yet.'}</div>}
      </Card>

      {editing && <BatchDialog batch={editing} onClose={() => setEditing(null)} />}
      {viewing && <InvoiceDialog invoice={viewing} onClose={() => setViewing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete batch ${deleting.id}?`}
          body="The batch is removed. Its invoices are not deleted — they stay open and can go into another batch."
          confirmLabel="Yes, delete batch"
          onConfirm={() => {
            deleteBatch(deleting.id);
            if (openId === deleting.id) setOpenId(null);
            setDeleting(null);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
