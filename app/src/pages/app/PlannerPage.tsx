import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EventDialog } from '../../components/EventDialog';
import { useAppShell } from '../../context/AppShellContext';
import { CATEGORIES, loadEvents, PLANNER_EVENTS, TODAY, type CategoryKey, type PlannerEvent } from '../../data/planner';
import {
  addDays, addMonths, formatTime, fromIso, iso, MONTHS, shortLabel, startOfWeek, toHhmm, toMinutes, WEEKDAYS,
} from '../../lib/dates';
import { usePersisted } from '../../lib/persist';
import { matchesQuery } from '../../lib/search';

type CalView = 'Day' | 'Week' | 'Month';
const VIEWS: CalView[] = ['Day', 'Week', 'Month'];
type Density = 'Compact' | 'Comfortable' | 'Spacious';
const ROW_H: Record<Density, number> = { Compact: 40, Comfortable: 56, Spacious: 76 };

interface Prefs {
  view: CalView;
  weekStart: number;
  showWeekends: boolean;
  dayStart: number;
  dayEnd: number;
  density: Density;
  hour24: boolean;
  hidden: CategoryKey[];
}

const DEFAULT_PREFS: Prefs = {
  view: 'Week', weekStart: 1, showWeekends: true, dayStart: 6, dayEnd: 20, density: 'Comfortable', hour24: false, hidden: [],
};

// One event as drawn on one day: all-day spans become a chip on each day they cover.
interface Occurrence {
  ev: PlannerEvent;
  date: string;
  start: number;
  end: number;
  allDay: boolean;
}

const TONE = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.tone])) as Record<CategoryKey, string>;
const LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label])) as Record<CategoryKey, string>;

function occurrencesOn(events: PlannerEvent[], date: string): Occurrence[] {
  return events
    .filter((e) => (e.start ? e.date === date : e.date <= date && date <= (e.endDate ?? e.date)))
    .map((ev) => ({
      ev,
      date,
      start: ev.start ? toMinutes(ev.start) : 0,
      end: ev.start ? Math.max(toMinutes(ev.end ?? ev.start), toMinutes(ev.start) + 15) : 24 * 60,
      allDay: !ev.start,
    }))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start || b.end - a.end);
}

// Overlapping timed events share the column: each gets a lane and the lane count of its cluster.
function layout(occ: Occurrence[]) {
  const out: { o: Occurrence; lane: number; lanes: number }[] = [];
  let cluster: { o: Occurrence; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    cluster.forEach((c) => out.push({ ...c, lanes: laneEnds.length }));
    cluster = [];
    laneEnds = [];
  };
  for (const o of occ) {
    if (o.start >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= o.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(o.end);
    } else {
      laneEnds[lane] = o.end;
    }
    cluster.push({ o, lane });
    clusterEnd = Math.max(clusterEnd, o.end);
  }
  flush();
  return out;
}

function reviveEvents(raw: unknown): PlannerEvent[] | null {
  return Array.isArray(raw) && raw.every((e) => e && typeof e.id === 'string' && typeof e.date === 'string') ? raw : null;
}

function revivePrefs(raw: unknown): Prefs | null {
  return raw && typeof raw === 'object' ? { ...DEFAULT_PREFS, ...(raw as Partial<Prefs>) } : null;
}

export function PlannerPage() {
  const { loads, query } = useAppShell();
  const [prefs, setPrefs] = usePersisted<Prefs>('runtruck-planner-prefs', DEFAULT_PREFS, revivePrefs);
  const [events, setEvents] = usePersisted<PlannerEvent[]>('runtruck-planner-events', PLANNER_EVENTS, reviveEvents);
  const [cursor, setCursor] = useState(() => fromIso(TODAY));
  const [selected, setSelected] = useState<{ o: Occurrence; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<{ ev: PlannerEvent; isNew: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const pref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));
  const { view } = prefs;
  const rowH = ROW_H[prefs.density];

  const shown = [...events, ...loadEvents(loads)].filter(
    (e) => !prefs.hidden.includes(e.category) && matchesQuery({ title: e.title, notes: e.notes, people: e.people?.join(' ') }, query),
  );

  // Columns on screen.
  const weekDays = (from: Date) =>
    Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => prefs.showWeekends || (d.getDay() !== 0 && d.getDay() !== 6));
  let days: Date[] = [];
  let weeks: Date[][] = [];
  if (view === 'Day') days = [cursor];
  if (view === 'Week') days = weekDays(startOfWeek(cursor, prefs.weekStart));
  if (view === 'Month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    for (let w = startOfWeek(first, prefs.weekStart); w.getMonth() === first.getMonth() || w < first; w = addDays(w, 7)) {
      weeks.push(weekDays(w));
    }
    weeks = weeks.filter((w) => w.length);
  }

  const move = (dir: 1 | -1) => {
    setSelected(null);
    setCursor((c) => (view === 'Day' ? addDays(c, dir) : view === 'Week' ? addDays(c, 7 * dir) : addMonths(c, dir)));
  };
  const openDay = (d: Date) => {
    setCursor(d);
    pref('view', 'Day');
    setSelected(null);
  };
  const create = (date: string, startMin?: number) => {
    setSelected(null);
    const s = startMin ?? 9 * 60;
    setEditing({
      isNew: true,
      ev: { id: `ev-${Date.now()}`, title: '', category: 'meeting', date, start: toHhmm(s), end: toHhmm(Math.min(s + 60, 23 * 60 + 45)) },
    });
  };
  const select = (o: Occurrence, e: MouseEvent) => {
    e.stopPropagation();
    setSelected({ o, x: e.clientX, y: e.clientY });
  };

  const monthName = MONTHS[cursor.getMonth()];
  const title = view === 'Day' ? `${WEEKDAYS[cursor.getDay()]}, ${monthName} ${cursor.getDate()}, ${cursor.getFullYear()}` : `${monthName} ${cursor.getFullYear()}`;
  const range = view === 'Week' && days.length
    ? `${shortLabel(days[0])} – ${shortLabel(days[days.length - 1])}`
    : view === 'Month' ? `${shown.filter((e) => e.date.startsWith(iso(cursor).slice(0, 7))).length} events this month` : '';
  const time = (min: number) => formatTime(min, prefs.hour24);

  return (
    <>
      <div className="cal-toolbar">
        <div className="cal-badge">
          <span>{monthName.slice(0, 3)}</span>
          <strong>{cursor.getDate()}</strong>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="cal-title">{title}</div>
          {range && <div className="cal-range">{range}</div>}
        </div>
        <div style={{ flex: 1 }} />
        <div className="cal-nav">
          <button type="button" className="ui-btn" onClick={() => move(-1)} aria-label={`Previous ${view.toLowerCase()}`}>‹</button>
          <button type="button" className="ui-btn" onClick={() => { setCursor(fromIso(TODAY)); setSelected(null); }}>Today</button>
          <button type="button" className="ui-btn" onClick={() => move(1)} aria-label={`Next ${view.toLowerCase()}`}>›</button>
        </div>
        <div className="ui-filter" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v} type="button" className={`ui-filter-opt${view === v ? ' is-active' : ''}`} onClick={() => { pref('view', v); setSelected(null); }}>
              {v}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <button type="button" className="ui-btn" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>Customize</button>
          {menuOpen && <CustomizeMenu prefs={prefs} pref={pref} onReset={() => { setPrefs(DEFAULT_PREFS); setEvents(PLANNER_EVENTS); }} onClose={() => setMenuOpen(false)} />}
        </div>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => create(iso(cursor))}>+ Add Event</button>
      </div>

      <div className="cal-legend">
        {CATEGORIES.map((c) => {
          const on = !prefs.hidden.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              className={`cal-legend-item${on ? '' : ' is-off'}`}
              aria-pressed={on}
              onClick={() => pref('hidden', on ? [...prefs.hidden, c.key] : prefs.hidden.filter((k) => k !== c.key))}
            >
              <span className={`cal-dot t-${c.tone}`} />
              {c.label}
            </button>
          );
        })}
      </div>

      {view === 'Month' ? (
        <MonthGrid
          weeks={weeks}
          month={cursor.getMonth()}
          events={shown}
          time={time}
          onOpenDay={openDay}
          onCreate={create}
          onSelect={select}
        />
      ) : (
        <TimeGrid
          days={days}
          events={shown}
          prefs={prefs}
          rowH={rowH}
          time={time}
          onOpenDay={view === 'Week' ? openDay : undefined}
          onCreate={create}
          onSelect={select}
        />
      )}

      {selected && (
        <EventPopover
          sel={selected}
          time={time}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing({ ev: selected.o.ev, isNew: false }); setSelected(null); }}
          onDelete={() => { setEvents((list) => list.filter((e) => e.id !== selected.o.ev.id)); setSelected(null); }}
        />
      )}

      {editing && (
        <EventDialog
          event={editing.ev}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onDelete={() => setEvents((list) => list.filter((e) => e.id !== editing.ev.id))}
          onSave={(ev) => setEvents((list) => (editing.isNew ? [...list, ev] : list.map((e) => (e.id === ev.id ? ev : e))))}
        />
      )}
    </>
  );
}

interface GridProps {
  events: PlannerEvent[];
  time: (min: number) => string;
  onOpenDay?: (d: Date) => void;
  onCreate: (date: string, startMin?: number) => void;
  onSelect: (o: Occurrence, e: MouseEvent) => void;
}

function TimeGrid({ days, events, prefs, rowH, time, onOpenDay, onCreate, onSelect }: GridProps & { days: Date[]; prefs: Prefs; rowH: number }) {
  const visStart = prefs.dayStart * 60;
  const visEnd = prefs.dayEnd * 60;
  const hours = Array.from({ length: prefs.dayEnd - prefs.dayStart }, (_, i) => prefs.dayStart + i);
  const cols = { gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))` };
  const byDay = days.map((d) => occurrencesOn(events, iso(d)));
  const hasAllDay = byDay.some((list) => list.some((o) => o.allDay));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Open on the first event of the range (or the working morning), not at midnight.
  const firstStart = Math.min(...byDay.flat().filter((o) => !o.allDay && o.end > visStart).map((o) => o.start), 8 * 60);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: Math.max(0, ((firstStart - visStart) / 60) * rowH - 12) });
  }, [firstStart, visStart, rowH, days.length]);

  const clickSlot = (date: string, e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    onCreate(date, Math.min(visStart + Math.floor((y / rowH) * 2) * 30, visEnd - 30));
  };

  return (
    <div className="cal">
      <div className="cal-scroll" ref={scrollRef}>
        <div className="cal-sticky">
          <div className="cal-head" style={cols}>
            <div />
            {days.map((d) => {
              const today = iso(d) === TODAY;
              const inner = (
                <>
                  <span className="cal-head-num">{d.getDate()}</span>
                  <span className="cal-head-day">{WEEKDAYS[d.getDay()].slice(0, 3)}</span>
                </>
              );
              return (
                <div key={iso(d)} className="cal-head-cell">
                  {onOpenDay ? (
                    <button type="button" className={`cal-head-btn${today ? ' is-today' : ''}`} onClick={() => onOpenDay(d)}>{inner}</button>
                  ) : (
                    <div className={`cal-head-btn${today ? ' is-today' : ''}`}>{inner}</div>
                  )}
                </div>
              );
            })}
          </div>
  
          {hasAllDay && (
            <div className="cal-allday" style={cols}>
              <div className="cal-gutter-label">All day</div>
              {byDay.map((list, i) => (
                <div key={i} className="cal-allday-cell">
                  {list.filter((o) => o.allDay).map((o) => (
                    <button key={o.ev.id} type="button" className={`cal-chip t-${TONE[o.ev.category]}`} onClick={(e) => onSelect(o, e)}>
                      {o.ev.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cal-body" style={{ ...cols, height: hours.length * rowH, '--cal-row': `${rowH}px` } as CSSProperties}>
          <div className="cal-gutter">
            {hours.map((h) => (
              <div key={h} className="cal-hour" style={{ height: rowH }}>{h > prefs.dayStart && time(h * 60)}</div>
            ))}
          </div>
          {days.map((d, i) => {
            const date = iso(d);
            const timed = byDay[i].filter((o) => !o.allDay && o.end > visStart && o.start < visEnd);
            return (
              <div key={date} className={`cal-col${date === TODAY ? ' is-today' : ''}`} onClick={(e) => clickSlot(date, e)}>
                {layout(timed).map(({ o, lane, lanes }) => {
                  const top = ((Math.max(o.start, visStart) - visStart) / 60) * rowH;
                  const height = Math.max(((Math.min(o.end, visEnd) - Math.max(o.start, visStart)) / 60) * rowH - 3, 20);
                  return (
                    <button
                      key={o.ev.id}
                      type="button"
                      className={`cal-ev t-${TONE[o.ev.category]}`}
                      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                      onClick={(e) => onSelect(o, e)}
                      title={`${o.ev.title} · ${time(o.start)} – ${time(o.end)}`}
                    >
                      <span className="cal-ev-title">{o.ev.title}</span>
                      {height >= 38 && <span className="cal-ev-time">{time(o.start)} – {time(o.end)}</span>}
                      {height >= 70 && o.ev.notes && <span className="cal-ev-note">{o.ev.notes}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ weeks, month, events, time, onOpenDay, onCreate, onSelect }: GridProps & { weeks: Date[][]; month: number }) {
  const MAX = 3;
  const cols = { gridTemplateColumns: `repeat(${weeks[0]?.length ?? 7}, minmax(0, 1fr))` };
  return (
    <div className="cal">
      <div className="cal-month-head" style={cols}>
        {(weeks[0] ?? []).map((d) => <div key={d.getDay()}>{WEEKDAYS[d.getDay()].slice(0, 3)}</div>)}
      </div>
      {weeks.map((week) => (
        <div key={iso(week[0])} className="cal-month-row" style={cols}>
          {week.map((d) => {
            const date = iso(d);
            const list = occurrencesOn(events, date);
            return (
              <div
                key={date}
                className={`cal-month-cell${d.getMonth() === month ? '' : ' is-other'}`}
                onClick={(e) => { if (e.target === e.currentTarget) onCreate(date); }}
              >
                <button type="button" className={`cal-month-num${date === TODAY ? ' is-today' : ''}`} onClick={() => onOpenDay?.(d)}>
                  {d.getDate()}
                </button>
                {list.slice(0, MAX).map((o) => (
                  <button key={o.ev.id} type="button" className={`cal-month-ev t-${TONE[o.ev.category]}`} onClick={(e) => onSelect(o, e)}>
                    <span className={`cal-dot t-${TONE[o.ev.category]}`} />
                    {!o.allDay && <span className="cal-month-time">{time(o.start)}</span>}
                    <span className="cal-month-title">{o.ev.title}</span>
                  </button>
                ))}
                {list.length > MAX && (
                  <button type="button" className="ui-link cal-more" onClick={() => onOpenDay?.(d)}>+{list.length - MAX} more</button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Close a floating panel on an outside press or Escape.
function useDismiss(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return ref;
}

function EventPopover({ sel, time, onClose, onEdit, onDelete }: {
  sel: { o: Occurrence; x: number; y: number };
  time: (min: number) => string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useDismiss(onClose);
  const { o } = sel;
  const ev = o.ev;
  const people = ev.people?.filter((p) => p && p !== 'Unassigned') ?? [];
  const left = Math.max(12, Math.min(sel.x + 12, window.innerWidth - 352));
  const top = Math.max(12, Math.min(sel.y - 20, window.innerHeight - 320));
  const when = o.allDay
    ? ev.endDate ? `${shortLabel(fromIso(ev.date))} – ${shortLabel(fromIso(ev.endDate))}` : 'All day'
    : `${time(o.start)} – ${time(o.end)}`;

  return (
    <div ref={ref} className="cal-pop" style={{ left, top }} role="dialog" aria-label={ev.title}>
      <div className="cal-pop-title">
        <span className={`cal-dot is-ring t-${TONE[ev.category]}`} />
        {ev.title}
      </div>
      <div className="cal-pop-meta">
        <span>{shortLabel(fromIso(o.date))}</span>
        <span>{when}</span>
      </div>
      <div className="cal-pop-kind">{LABEL[ev.category]}</div>
      {ev.notes && <p className="cal-pop-notes">{ev.notes}</p>}
      {people.length > 0 && (
        <div className="cal-people">
          {people.slice(0, 3).map((p) => (
            <span key={p} className="cal-avatar" title={p}>{p.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
          ))}
          <span className="cal-people-text">{people.length > 3 ? `+${people.length - 3} more` : people.join(', ')}</span>
        </div>
      )}
      <div className="cal-pop-actions">
        {ev.loadId && <Link className="ui-btn ui-btn-sm" to={`/app/loads/${ev.loadId}`}>Open load {ev.loadId}</Link>}
        {!ev.readOnly && (
          <>
            <button type="button" className="ui-btn ui-btn-sm" onClick={onEdit}>Edit</button>
            <button type="button" className="ui-btn ui-btn-sm" onClick={onDelete}>Delete</button>
          </>
        )}
      </div>
      {ev.readOnly && <div className="cal-pop-hint">From the load board — change it on the load.</div>}
    </div>
  );
}

function CustomizeMenu({ prefs, pref, onReset, onClose }: {
  prefs: Prefs;
  pref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ref = useDismiss(onClose);
  const hourOptions = Array.from({ length: 25 }, (_, h) => h);
  const row = (label: string, control: ReactNode) => (
    <div className="cal-menu-row">
      <span>{label}</span>
      {control}
    </div>
  );
  const choice = <T extends string | number | boolean>(options: [T, string][], value: T, onChange: (v: T) => void) => (
    <div className="ui-filter">
      {options.map(([v, label]) => (
        <button key={label} type="button" className={`ui-filter-opt${value === v ? ' is-active' : ''}`} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );

  return (
    <div ref={ref} className="cal-menu" role="dialog" aria-label="Customize calendar">
      <div className="cal-menu-title">Customize</div>
      {row('Week starts on', choice<number>([[0, 'Sun'], [1, 'Mon']], prefs.weekStart, (v) => pref('weekStart', v)))}
      {row('Weekends', choice<boolean>([[true, 'Show'], [false, 'Hide']], prefs.showWeekends, (v) => pref('showWeekends', v)))}
      {row('Time format', choice<boolean>([[false, '12h'], [true, '24h']], prefs.hour24, (v) => pref('hour24', v)))}
      {row('Row height', choice<Density>([['Compact', 'S'], ['Comfortable', 'M'], ['Spacious', 'L']], prefs.density, (v) => pref('density', v)))}
      {row('Day starts', (
        <select className="ui-input cal-menu-select" value={prefs.dayStart} onChange={(e) => pref('dayStart', Math.min(Number(e.target.value), prefs.dayEnd - 1))}>
          {hourOptions.slice(0, 24).map((h) => <option key={h} value={h}>{formatTime(h * 60, prefs.hour24)}</option>)}
        </select>
      ))}
      {row('Day ends', (
        <select className="ui-input cal-menu-select" value={prefs.dayEnd} onChange={(e) => pref('dayEnd', Math.max(Number(e.target.value), prefs.dayStart + 1))}>
          {hourOptions.slice(1).map((h) => <option key={h} value={h}>{h === 24 ? 'Midnight' : formatTime(h * 60, prefs.hour24)}</option>)}
        </select>
      ))}
      <div className="cal-menu-foot">
        <button
          type="button"
          className="ui-link"
          onClick={() => {
            if (window.confirm('Reset the calendar layout and restore the original events? Events you added or edited will be removed.')) onReset();
          }}
        >
          Reset calendar
        </button>
      </div>
    </div>
  );
}
