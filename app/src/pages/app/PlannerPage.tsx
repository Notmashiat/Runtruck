import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarSettings, type SettingsPage } from '../../components/CalendarSettings';
import { EventDialog } from '../../components/EventDialog';
import { useAppShell } from '../../context/AppShellContext';
import {
  DEFAULT_CATEGORIES, DEFAULT_PREFS, loadEvents, PLANNER_EVENTS, ROW_H, TODAY, TONES,
  type CalView, type CardField, type Category, type ColorBy, type PlannerEvent, type Prefs,
} from '../../data/planner';
import {
  addDays, addMonths, formatTime, fromIso, iso, MONTHS, shortLabel, startOfWeek, toHhmm, toMinutes, WEEKDAYS,
} from '../../lib/dates';
import { usePersisted } from '../../lib/persist';
import { matchesQuery } from '../../lib/search';

const VIEWS: CalView[] = ['Day', 'Week', 'Month'];

// One event as drawn on one day: all-day spans become a chip on each day they cover.
interface Occurrence {
  ev: PlannerEvent;
  date: string;
  start: number;
  end: number;
  allDay: boolean;
}

// How the grids draw an event: its color and the lines on its card.
interface Look {
  tone: (ev: PlannerEvent) => string;
  lines: (o: Occurrence) => string[];
}

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

function valueOf(ev: PlannerEvent, by: ColorBy): string {
  const v = by === 'driver' ? ev.driver : by === 'customer' ? ev.customer : by === 'truck' ? ev.truck : '';
  return v && v !== 'Unassigned' ? v : 'Unassigned';
}

function reviveEvents(raw: unknown): PlannerEvent[] | null {
  return Array.isArray(raw) && raw.every((e) => e && typeof e.id === 'string' && typeof e.date === 'string') ? raw : null;
}

function revivePrefs(raw: unknown): Prefs | null {
  return raw && typeof raw === 'object' ? { ...DEFAULT_PREFS, ...(raw as Partial<Prefs>) } : null;
}

// Saved color codes, always with the two the load board needs (Loaded / Empty) first.
function reviveCategories(raw: unknown): Category[] | null {
  if (!Array.isArray(raw) || !raw.every((c) => c && typeof c.key === 'string' && typeof c.label === 'string' && typeof c.tone === 'string')) return null;
  const saved = raw as Category[];
  const locked = DEFAULT_CATEGORIES.filter((c) => c.locked).map((d) => ({ ...d, ...saved.find((c) => c.key === d.key), locked: true }));
  return [...locked, ...saved.filter((c) => !locked.some((l) => l.key === c.key)).map((c) => ({ ...c, locked: false }))];
}

export function PlannerPage() {
  const { loads, query } = useAppShell();
  const [prefs, setPrefs] = usePersisted<Prefs>('runtruck-planner-prefs', DEFAULT_PREFS, revivePrefs);
  const [events, setEvents] = usePersisted<PlannerEvent[]>('runtruck-planner-events', PLANNER_EVENTS, reviveEvents);
  const [categories, setCategories] = usePersisted<Category[]>('runtruck-planner-categories', DEFAULT_CATEGORIES, reviveCategories);
  const [cursor, setCursor] = useState(() => fromIso(TODAY));
  const [selected, setSelected] = useState<{ o: Occurrence; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<{ ev: PlannerEvent; isNew: boolean } | null>(null);
  const [settings, setSettings] = useState<SettingsPage | null>(null);

  const pref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));
  const { view, colorBy } = prefs;
  const byValue = colorBy !== 'type';
  const time = (min: number) => formatTime(min, prefs.hour24);

  // — colors —
  const all = [...events, ...loadEvents(loads)];
  const catOf = new Map(categories.map((c) => [c.key, c]));
  const values = byValue ? [...new Set(all.filter((e) => e.readOnly).map((e) => valueOf(e, colorBy)))].sort() : [];
  const valueTone = (v: string) => prefs.valueTones[`${colorBy}:${v}`] ?? TONES[values.indexOf(v) % TONES.length];
  const colorKey = (ev: PlannerEvent) => (byValue && ev.readOnly ? `${colorBy}:${valueOf(ev, colorBy)}` : ev.category);
  const look: Look = {
    tone: (ev) => (byValue && ev.readOnly ? valueTone(valueOf(ev, colorBy)) : catOf.get(ev.category)?.tone ?? 'slate'),
    lines: (o) => {
      const field = (f: CardField): string => {
        const ev = o.ev;
        const map: Record<CardField, string | undefined> = {
          place: ev.place,
          title: ev.title,
          category: catOf.get(ev.category)?.label ?? 'Uncategorized',
          time: o.allDay ? 'All day' : `${time(o.start)} – ${time(o.end)}`,
          load: ev.loadId,
          driver: ev.driver ?? ev.people?.[0],
          truck: ev.truck,
          customer: ev.customer,
          facility: ev.facility,
          commodity: ev.commodity,
          none: '',
        };
        return map[f] ?? '';
      };
      const [first, ...rest] = prefs.cardLines;
      return [field(first) || o.ev.title, ...rest.map(field).filter(Boolean)];
    },
  };

  // Legend chips double as show / hide filters.
  const legend = byValue
    ? [
        ...categories.filter((c) => !c.locked).map((c) => ({ key: c.key, label: c.label, tone: c.tone })),
        ...values.map((v) => ({ key: `${colorBy}:${v}`, label: v, tone: valueTone(v) })),
      ]
    : categories.map((c) => ({ key: c.key, label: c.label, tone: c.tone }));

  const shown = all.filter(
    (e) => !prefs.hidden.includes(colorKey(e))
      && matchesQuery({ title: e.title, place: e.place, notes: e.notes, people: e.people?.join(' '), customer: e.customer, truck: e.truck }, query),
  );

  // — color code edits —
  const updateCategory = (key: string, patch: Partial<Category>) => setCategories((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const addCategory = () => {
    const used = new Set(categories.map((c) => c.tone));
    const tone = TONES.find((t) => !used.has(t)) ?? 'slate';
    setCategories((cs) => [...cs, { key: `code-${Date.now()}`, label: 'New color code', tone }]);
  };
  const deleteCategory = (key: string) => {
    const gone = categories.find((c) => c.key === key);
    const fallback = categories.find((c) => !c.locked && c.key !== key);
    if (!gone || !fallback) {
      window.alert('Keep at least one color code for your own events.');
      return;
    }
    const n = events.filter((e) => e.category === key).length;
    if (n && !window.confirm(`Delete “${gone.label}”? Its ${n} event${n === 1 ? '' : 's'} move to “${fallback.label}”.`)) return;
    setEvents((list) => list.map((e) => (e.category === key ? { ...e, category: fallback.key } : e)));
    setCategories((cs) => cs.filter((c) => c.key !== key));
    pref('hidden', prefs.hidden.filter((k) => k !== key));
  };

  // — columns on screen —
  const weekDays = (from: Date) =>
    Array.from({ length: 7 }, (_, i) => addDays(from, i)).filter((d) => prefs.showWeekends || (d.getDay() !== 0 && d.getDay() !== 6));
  let days: Date[] = [];
  const weeks: Date[][] = [];
  if (view === 'Day') days = [cursor];
  if (view === 'Week') days = weekDays(startOfWeek(cursor, prefs.weekStart));
  if (view === 'Month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    for (let w = startOfWeek(first, prefs.weekStart); w.getMonth() === first.getMonth() || w < first; w = addDays(w, 7)) {
      const week = weekDays(w);
      if (week.length) weeks.push(week);
    }
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
    const category = categories.find((c) => !c.locked)?.key ?? 'meeting';
    setEditing({
      isNew: true,
      ev: { id: `ev-${Date.now()}`, title: '', category, date, start: toHhmm(s), end: toHhmm(Math.min(s + 60, 23 * 60 + 45)) },
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

  // A sample load stop for the Event cards preview.
  const sampleEv = all.find((e) => e.readOnly && e.category === 'pickup') ?? all[0];
  const sampleOcc = sampleEv && occurrencesOn([sampleEv], sampleEv.date)[0];

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
        <button type="button" className="ui-btn" onClick={() => setSettings('Layout')}>Customize</button>
        <button type="button" className="ui-btn ui-btn-primary" onClick={() => create(iso(cursor))}>+ Add Event</button>
      </div>

      <div className="cal-legend">
        {legend.map((c) => {
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
        <button type="button" className="ui-link cal-legend-edit" onClick={() => setSettings('Color codes')}>Edit colors</button>
      </div>

      {view === 'Month' ? (
        <MonthGrid weeks={weeks} month={cursor.getMonth()} events={shown} look={look} time={time} onOpenDay={openDay} onCreate={create} onSelect={select} />
      ) : (
        <TimeGrid
          days={days}
          events={shown}
          prefs={prefs}
          look={look}
          time={time}
          onOpenDay={view === 'Week' ? openDay : undefined}
          onCreate={create}
          onSelect={select}
        />
      )}

      {selected && (
        <EventPopover
          sel={selected}
          look={look}
          time={time}
          category={catOf.get(selected.o.ev.category)}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing({ ev: selected.o.ev, isNew: false }); setSelected(null); }}
          onDelete={() => { setEvents((list) => list.filter((e) => e.id !== selected.o.ev.id)); setSelected(null); }}
        />
      )}

      {editing && (
        <EventDialog
          event={editing.ev}
          categories={categories}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onDelete={() => setEvents((list) => list.filter((e) => e.id !== editing.ev.id))}
          onSave={(ev) => setEvents((list) => (editing.isNew ? [...list, ev] : list.map((e) => (e.id === ev.id ? ev : e))))}
        />
      )}

      {settings && (
        <CalendarSettings
          page={settings}
          prefs={prefs}
          pref={pref}
          categories={categories}
          onCategory={updateCategory}
          onAddCategory={addCategory}
          onDeleteCategory={deleteCategory}
          values={values}
          valueTone={valueTone}
          sample={sampleOcc ? { lines: look.lines(sampleOcc), tone: look.tone(sampleOcc.ev) } : { lines: ['Fresno, CA'], tone: 'amber' }}
          onReset={() => { setPrefs(DEFAULT_PREFS); setEvents(PLANNER_EVENTS); setCategories(DEFAULT_CATEGORIES); }}
          onClose={() => setSettings(null)}
        />
      )}
    </>
  );
}

interface GridProps {
  events: PlannerEvent[];
  look: Look;
  time: (min: number) => string;
  onOpenDay?: (d: Date) => void;
  onCreate: (date: string, startMin?: number) => void;
  onSelect: (o: Occurrence, e: MouseEvent) => void;
}

function TimeGrid({ days, events, prefs, look, time, onOpenDay, onCreate, onSelect }: GridProps & { days: Date[]; prefs: Prefs }) {
  const rowH = ROW_H[prefs.density];
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
                    <button key={o.ev.id} type="button" className={`cal-chip t-${look.tone(o.ev)}`} onClick={(e) => onSelect(o, e)}>
                      {look.lines(o)[0]}
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
                  const lines = look.lines(o);
                  const fit = Math.max(1, Math.floor((height - 8) / 16));
                  return (
                    <button
                      key={o.ev.id}
                      type="button"
                      className={`cal-ev t-${look.tone(o.ev)}`}
                      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}
                      onClick={(e) => onSelect(o, e)}
                      title={lines.join(' · ')}
                    >
                      <span className="cal-ev-title">{lines[0]}</span>
                      {lines.slice(1, fit).map((t, j) => <span key={j} className="cal-ev-line">{t}</span>)}
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

function MonthGrid({ weeks, month, events, look, time, onOpenDay, onCreate, onSelect }: GridProps & { weeks: Date[][]; month: number }) {
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
                {list.slice(0, MAX).map((o) => {
                  const tone = look.tone(o.ev);
                  return (
                    <button key={o.ev.id} type="button" className={`cal-month-ev t-${tone}`} onClick={(e) => onSelect(o, e)}>
                      <span className={`cal-dot t-${tone}`} />
                      {!o.allDay && <span className="cal-month-time">{time(o.start)}</span>}
                      <span className="cal-month-title">{look.lines(o)[0]}</span>
                    </button>
                  );
                })}
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

function EventPopover({ sel, look, time, category, onClose, onEdit, onDelete }: {
  sel: { o: Occurrence; x: number; y: number };
  look: Look;
  time: (min: number) => string;
  category?: Category;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ref = useDismiss(onClose);
  const { o } = sel;
  const ev = o.ev;
  const people = ev.people?.filter((p) => p && p !== 'Unassigned') ?? [];
  const left = Math.max(12, Math.min(sel.x + 12, window.innerWidth - 352));
  const top = Math.max(12, Math.min(sel.y - 20, window.innerHeight - 360));
  const lines = look.lines(o);
  const details = [
    ['City, state', ev.place], ['Facility', ev.facility], ['Customer', ev.customer], ['Truck', ev.truck], ['Commodity', ev.commodity],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div ref={ref} className="cal-pop" style={{ left, top }} role="dialog" aria-label={lines[0]}>
      <div className="cal-pop-title">
        <span className={`cal-dot is-ring t-${look.tone(ev)}`} />
        {lines[0]}
      </div>
      <div className="cal-pop-meta">
        <span>{shortLabel(fromIso(o.date))}</span>
        <span>{o.allDay ? (ev.endDate ? `Until ${shortLabel(fromIso(ev.endDate))}` : 'All day') : `${time(o.start)} – ${time(o.end)}`}</span>
      </div>
      <div className="cal-pop-kind">{category?.label ?? 'Uncategorized'}{ev.loadId ? ` · ${ev.loadId}` : ''}</div>
      {details.length > 0 && (
        <dl className="cal-pop-details">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {ev.notes && !ev.readOnly && <p className="cal-pop-notes">{ev.notes}</p>}
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
