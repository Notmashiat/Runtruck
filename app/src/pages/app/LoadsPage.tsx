import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Kpis } from '../../components/Kpis';
import { NewLoadDialog } from '../../components/NewLoadDialog';
import { Tag } from '../../components/Tag';
import { useAppShell, type LoadTab } from '../../context/AppShellContext';
import { ACTIVE_STATUSES, stopsOf, type Load } from '../../data/mock';
import { matchesQuery } from '../../lib/search';
import { isoOf, numberOf, SortTh, useSort, usePageFilters, type FilterDef } from '../../lib/tableTools';

const TABS: LoadTab[] = ['Active', 'Needs POD', 'Delivered', 'All'];

function listFor(loads: Load[], tab: LoadTab): Load[] {
  if (tab === 'All') return loads;
  if (tab === 'Active') return loads.filter((l) => ACTIVE_STATUSES.includes(l.status));
  return loads.filter((l) => l.status === tab);
}

function firstId(list: Load[]): string | null {
  return list.length ? list[0].id : null;
}

export function LoadsPage() {
  const { query, setQuery, loadTab, setLoadTab, loads } = useAppShell();
  const searching = query.trim().length > 0;

  // A search looks across every load, regardless of the filter.
  const base = searching ? loads.filter((l) => matchesQuery(l, query)) : listFor(loads, loadTab);
  const filters: FilterDef<Load>[] = [
    { key: 'status', label: 'Status', type: 'select', get: (l) => l.status },
    { key: 'customer', label: 'Customer', type: 'select', get: (l) => l.customer },
    { key: 'driver', label: 'Driver', type: 'select', get: (l) => l.driver },
    { key: 'equipment', label: 'Equipment', type: 'select', get: (l) => l.equip },
    { key: 'carrier', label: 'Carrier', type: 'select', get: (l) => (l.carrier.includes('own fleet') ? 'Own fleet' : l.carrier) },
    { key: 'pickup', label: 'Pickup date', type: 'dates', get: (l) => isoOf(l.pickup) },
    { key: 'delivery', label: 'Delivery date', type: 'dates', get: (l) => isoOf(l.delivery) },
    { key: 'rate', label: 'Rate', type: 'range', get: (l) => numberOf(l.rate), prefix: '$' },
    { key: 'miles', label: 'Miles', type: 'range', get: (l) => numberOf(l.miles), suffix: ' mi' },
    { key: 'rpm', label: 'Rate per mile', type: 'range', get: (l) => numberOf(l.rpm), prefix: '$' },
  ];
  const sort = useSort(usePageFilters(base, filters), { unit: (l) => (l.unit === '—' ? null : l.unit) });
  const rows = sort.rows;
  const [openId, setOpenId] = useState<string | null>(firstId(rows));
  const [editing, setEditing] = useState<Load | null>(null);

  const countOf = (status: string) => String(loads.filter((l) => l.status === status).length);
  const kpis = [
    { label: 'Undispatched', value: countOf('Needs driver'), note: 'No driver assigned yet' },
    { label: 'In transit', value: countOf('In transit'), note: `Loaded and rolling · ${countOf('At pickup')} at pickup` },
    { label: 'Delivered', value: countOf('Delivered'), note: 'Delivered with POD' },
    { label: 'Needs POD', value: countOf('Needs POD'), note: 'Delivered, proof of delivery not in' },
  ];

  const countText = searching ? `${rows.length} matching “${query}”` : `${rows.length} loads`;

  const filter = (
    <div className="ui-filter">
      {TABS.map((o) => (
        <button
          key={o}
          type="button"
          className={`ui-filter-opt${!searching && loadTab === o ? ' is-active' : ''}`}
          onClick={() => { setLoadTab(o); setQuery(''); setOpenId(firstId(listFor(loads, o))); }}
        >
          {o}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Kpis items={kpis} />

      <Card flush title={countText} action={filter}>
        <table className="ui-table">
          <thead>
            <tr>
              <SortTh sort={sort} k="id">Load #</SortTh><SortTh sort={sort} k="ref">Tender #</SortTh><SortTh sort={sort} k="unit">Truck</SortTh><SortTh sort={sort} k="route">Route</SortTh><SortTh sort={sort} k="pickup">Pickup</SortTh><SortTh sort={sort} k="driver">Driver</SortTh>
              <SortTh sort={sort} k="rate" num>Rate</SortTh><SortTh sort={sort} k="status" num>Status</SortTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const open = openId === l.id;
              const unassigned = l.unit === '—';
              const stops = stopsOf(l);
              return (
                <Fragment key={l.id}>
                  <tr className={`is-clickable${open ? ' is-open' : ''}`} onClick={() => setOpenId(open ? null : l.id)}>
                    <td className="strong">{l.id}</td>
                    <td className="strong">{l.ref}</td>
                    <td className={unassigned ? 'muted' : ''}>{unassigned ? 'Unassigned' : l.unit}</td>
                    <td>{l.route}</td>
                    <td>{l.pickup}</td>
                    <td>{l.driver}</td>
                    <td className="num">{l.rate}</td>
                    <td className="num"><Tag label={l.status} tagClass={l.tagClass} /></td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={8} className="ui-expand-cell">
                        <div className="ui-expand">
                          <div>
                            <div className="ui-label">Stops ({stops.length})</div>
                            {stops.map((s, i) => (
                              <div key={i} className="ui-stop">
                                <div className={`ui-stop-kind ${s.kind === 'Pickup' ? 'pickup' : 'delivery'}`}>{s.kind} · Stop {i + 1}</div>
                                <div className="ui-stop-name">{s.name}</div>
                                <div className="ui-stop-meta">{s.address}</div>
                                <div className="ui-stop-meta">{s.when}</div>
                              </div>
                            ))}
                          </div>

                          <div>
                            <div className="ui-label">Load details</div>
                            <div className="ui-kv">
                              {[
                                ['System load #', l.id],
                                ['Tender #', l.ref],
                                ['Commodity', l.commodity],
                                ['Weight', l.weight],
                                ['Equipment', l.equip],
                                ['Rate', l.rate],
                              ].map(([k, v]) => (
                                <div key={k}>
                                  <div className="ui-label">{k}</div>
                                  <div className="ui-kv-value">{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div>
                            <div className="ui-label">Customer</div>
                            <div className="ui-kv">
                              <div>
                                <div className="ui-kv-value">{l.customer}</div>
                                <div className="ui-stop-meta">{l.temp} · {l.equip}</div>
                              </div>
                              <div className="ui-link-stack">
                                <Link className="ui-link" to={`/app/loads/${l.id}`}>Open load →</Link>
                                <button type="button" className="ui-link" onClick={(e) => { e.stopPropagation(); setEditing(l); }}>
                                  Edit load
                                </button>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="ui-label">Truck &amp; driver</div>
                            <div className="ui-kv">
                              <div>
                                <div className="ui-label">Truck</div>
                                <div className="ui-kv-value">{unassigned ? 'Unassigned' : l.unit}</div>
                              </div>
                              <div>
                                <div className="ui-label">Driver</div>
                                <div className="ui-kv-value">{l.driver}</div>
                              </div>
                            </div>
                            <div className="ui-label" style={{ marginTop: 22 }}>Carrier</div>
                            <div className="ui-kv">
                              <div>
                                <div className="ui-label">Name</div>
                                <div className="ui-kv-value">{l.carrier}</div>
                              </div>
                              <div>
                                <div className="ui-label">MC · DOT</div>
                                <div className="ui-kv-value">{l.carrierMc} · {l.carrierDot}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="ui-empty">{base.length ? 'Nothing matches the search or filters.' : searching ? `Nothing matches “${query}”.` : 'No loads in this view.'}</div>
        )}
      </Card>

      {editing && (
        <NewLoadDialog load={editing} onClose={() => setEditing(null)} onDeleted={() => setEditing(null)} />
      )}
    </>
  );
}
