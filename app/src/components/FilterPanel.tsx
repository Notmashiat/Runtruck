import { useAppShell } from '../context/AppShellContext';
import { isActive, type DatesValue, type FilterMeta, type FilterValue, type RangeValue } from '../lib/tableTools';
import { currentYear } from '../lib/clock';
import { useModal } from './FormBits';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso: string) => (iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}${Number(iso.slice(0, 4)) !== currentYear() ? `, ${iso.slice(0, 4)}` : ''}` : '');

// One line describing a chosen filter, for the chips under the top bar.
export function describe(m: FilterMeta, v: FilterValue): string {
  if (m.type === 'toggle') return m.label;
  if (m.type === 'select') {
    const list = v as string[];
    return `${m.label}: ${list.slice(0, 2).join(', ')}${list.length > 2 ? ` +${list.length - 2}` : ''}`;
  }
  if (m.type === 'range') {
    const { min, max } = v as RangeValue;
    const f = (x: string) => `${m.prefix ?? ''}${Number(x).toLocaleString('en-US')}${m.suffix ?? ''}`;
    return `${m.label}: ${min && max ? `${f(min)}–${f(max)}` : min ? `≥ ${f(min)}` : `≤ ${f(max ?? '')}`}`;
  }
  const { from, to } = v as DatesValue;
  return `${m.label}: ${from && to ? `${short(from)} – ${short(to)}` : from ? `from ${short(from)}` : `until ${short(to ?? '')}`}`;
}

// The Filters side panel for the page on screen. Choices apply as they are made.
export function FilterPanel({ page, title, onClose }: { page: string; title: string; onClose: () => void }) {
  const { filterMeta, filterValues, setFilter, clearFilters } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const meta = filterMeta[page] ?? [];
  const values = filterValues[page] ?? {};
  const active = meta.filter((m) => isActive(values[m.key])).length;

  return (
    <dialog ref={ref} className="ui-dialog is-sheet" aria-label={`Filters · ${title}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <h2 className="ui-h2" style={{ margin: 0 }}>Filters</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>{title} · applies as you choose</p>
          </div>
          {meta.length === 0 && <div className="ui-note">This page has no filters.</div>}
          {meta.map((m) => {
            const v = values[m.key];
            return (
              <div key={m.key} className="ui-filter-field">
                <div className="ui-filter-field-head">
                  <span className="ui-label">{m.label}</span>
                  {isActive(v) && <button type="button" className="ui-link" onClick={() => setFilter(page, m.key, undefined)}>Clear</button>}
                </div>

                {m.type === 'select' && (
                  <div className="ui-filter-options">
                    {(m.options ?? []).map((o) => {
                      const chosen = ((v as string[] | undefined) ?? []);
                      const on = chosen.includes(o.value);
                      return (
                        <label key={o.value} className={`ui-check${o.count === 0 && !on ? ' is-empty' : ''}`}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => setFilter(page, m.key, e.target.checked ? [...chosen, o.value] : chosen.filter((x) => x !== o.value))}
                          />
                          <span className="ui-filter-option">{o.value}</span>
                          <span className="ui-filter-count">{o.count}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {m.type === 'range' && (
                  <div className="ui-filter-pair">
                    {(['min', 'max'] as const).map((edge) => (
                      <label key={edge} className="ui-field">
                        <span className="ui-field-help">{edge === 'min' ? 'At least' : 'At most'}{m.prefix ? ` (${m.prefix.trim()})` : ''}{m.suffix ? ` (${m.suffix.trim()})` : ''}</span>
                        <input
                          className="ui-input" inputMode="decimal" placeholder={edge === 'min' ? 'Min' : 'Max'}
                          value={((v as RangeValue | undefined) ?? {})[edge] ?? ''}
                          onChange={(e) => setFilter(page, m.key, { ...((v as RangeValue | undefined) ?? {}), [edge]: e.target.value.replace(/[^\d.-]/g, '') })}
                        />
                      </label>
                    ))}
                  </div>
                )}

                {m.type === 'dates' && (
                  <div className="ui-filter-pair">
                    {(['from', 'to'] as const).map((edge) => (
                      <label key={edge} className="ui-field">
                        <span className="ui-field-help">{edge === 'from' ? 'From' : 'To'}</span>
                        <input
                          className="ui-input" type="date"
                          value={((v as DatesValue | undefined) ?? {})[edge] ?? ''}
                          onChange={(e) => setFilter(page, m.key, { ...((v as DatesValue | undefined) ?? {}), [edge]: e.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                )}

                {m.type === 'toggle' && (
                  <label className="ui-check">
                    <input type="checkbox" checked={v === true} onChange={(e) => setFilter(page, m.key, e.target.checked ? true : undefined)} />
                    {m.hint ?? m.label}
                  </label>
                )}
              </div>
            );
          })}
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" disabled={active === 0} onClick={() => clearFilters(page)}>Clear all</button>
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 13 }}>{active} active</span>
          <button type="button" className="ui-btn ui-btn-primary" onClick={closeNow}>Done</button>
        </footer>
      </div>
    </dialog>
  );
}
