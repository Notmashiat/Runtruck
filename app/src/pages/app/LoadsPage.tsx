import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Kpis } from '../../components/Kpis';
import { Tag } from '../../components/Tag';
import { useAppShell, type LoadTab } from '../../context/AppShellContext';
import { ACTIVE_STATUSES, LOADS, type Load } from '../../data/mock';
import { matchesQuery } from '../../lib/search';

const TABS: LoadTab[] = ['Active', 'Needs POD', 'Delivered', 'All'];

function countOf(status: string) {
  return String(LOADS.filter((l) => l.status === status).length);
}

const KPIS = [
  { label: 'Undispatched', value: countOf('Needs driver') },
  { label: 'In transit', value: countOf('In transit') },
  { label: 'Delivered', value: countOf('Delivered') },
  { label: 'Needs POD', value: countOf('Needs POD') },
];

function listFor(tab: LoadTab): Load[] {
  if (tab === 'All') return LOADS;
  if (tab === 'Active') return LOADS.filter((l) => ACTIVE_STATUSES.includes(l.status));
  return LOADS.filter((l) => l.status === tab);
}

function firstId(list: Load[]): string | null {
  return list.length ? list[0].id : null;
}

export function LoadsPage() {
  const { query, setQuery, loadTab, setLoadTab } = useAppShell();
  const searching = query.trim().length > 0;

  // A search looks across every load, regardless of the filter.
  const rows = searching ? LOADS.filter((l) => matchesQuery(l, query)) : listFor(loadTab);
  const [openId, setOpenId] = useState<string | null>(firstId(rows));

  const countText = searching ? `${rows.length} matching “${query}”` : `${rows.length} loads`;

  const filter = (
    <div className="ui-filter">
      {TABS.map((o) => (
        <button
          key={o}
          type="button"
          className={`ui-filter-opt${!searching && loadTab === o ? ' is-active' : ''}`}
          onClick={() => { setLoadTab(o); setQuery(''); setOpenId(firstId(listFor(o))); }}
        >
          {o}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <Kpis items={KPIS} />

      <Card flush title={countText} action={filter}>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Load #</th><th>Tender #</th><th>Truck</th><th>Route</th><th>Pickup</th><th>Driver</th>
              <th className="num">Rate</th><th className="num">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const open = openId === l.id;
              const unassigned = l.unit === '—';
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
                            <div className="ui-label">Stops (2)</div>
                            <div className="ui-stop">
                              <div className="ui-stop-kind pickup">Pickup · Stop 1</div>
                              <div className="ui-stop-name">{l.from}</div>
                              <div className="ui-stop-meta">{l.fromAddr}</div>
                              <div className="ui-stop-meta">Pickup {l.pickup} · 08:00–14:00</div>
                            </div>
                            <div className="ui-stop">
                              <div className="ui-stop-kind delivery">Delivery · Stop 2</div>
                              <div className="ui-stop-name">{l.to}</div>
                              <div className="ui-stop-meta">{l.toAddr}</div>
                              <div className="ui-stop-meta">Deliver {l.delivery} · 06:00–12:00</div>
                            </div>
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
                              <div>
                                <Link className="ui-link" to={`/app/loads/${l.id}`}>Open load →</Link>
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
          <div className="ui-empty">{searching ? `Nothing matches “${query}”.` : 'No loads in this view.'}</div>
        )}
      </Card>
    </>
  );
}
