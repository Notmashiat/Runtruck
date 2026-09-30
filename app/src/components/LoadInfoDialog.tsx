import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppShell } from '../context/AppShellContext';
import {
  TODAY, billToFor, daysFrom, fmtDate, rateLines, termsFor, usd, type BillableLoad,
} from '../data/invoicing';
import { stopsOf } from '../data/mock';
import { useModal } from './FormBits';
import { Tag } from './Tag';

function Item({ k, children }: { k: string; children: ReactNode }) {
  if (children === '' || children === null || children === undefined) return null;
  return (
    <div>
      <div className="ui-label">{k}</div>
      <div className="ui-kv-value">{children}</div>
    </div>
  );
}

// A small read-only popup with everything about a delivered load waiting to
// be invoiced, and the way to invoice it.
export function LoadInfoDialog({ load, onInvoice, onClose }: { load: BillableLoad; onInvoice: () => void; onClose: () => void }) {
  const { loads } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const board = loads.find((l) => l.id === load.id);
  const [haul, fsc] = rateLines(load.amount, load.route, load.miles);
  const miles = Number(load.miles.replace(/[^\d.]/g, '')) || 0;
  const bill = billToFor(load.customer);
  const waiting = load.delivered ? daysFrom(load.delivered, TODAY) : 0;
  const stops = board ? stopsOf(board) : [];

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-compact"
      aria-label={`Load ${load.id}`}
      onClose={(e) => { if (ownEvent(e)) onClose(); }}
      onCancel={(e) => ownEvent(e)}
    >
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Load</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{load.id}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>{load.customer} · {load.route}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              <Tag label={board?.status ?? 'Delivered'} tagClass="tag-neutral" />
              <Tag label={load.pod === 'Missing' ? 'POD missing' : 'POD attached'} tagClass={load.pod === 'Missing' ? 'tag-outline' : 'tag-green'} />
              <Tag label="Not invoiced" tagClass="tag-outline" />
            </div>
          </div>

          {load.pod === 'Missing' && (
            <div className="ui-note">No proof of delivery on file. Get the signed POD before invoicing — most customers short-pay or reject without it.</div>
          )}

          <div className="ui-kv-grid">
            <Item k="Picked up">{fmtDate(load.pickup)}</Item>
            <Item k="Delivered">{`${fmtDate(load.delivered)}${waiting > 0 ? ` · ${waiting} d ago` : ''}`}</Item>
            <Item k="Customer reference">{load.ref}</Item>
            <Item k="Equipment">{load.equipment}</Item>
            <Item k="Commodity">{load.commodity}</Item>
            <Item k="Weight">{load.weight}</Item>
            <Item k="Miles">{load.miles}</Item>
            {board && <Item k="Driver · truck">{`${board.driver} · ${board.unit}`}</Item>}
            {board && <Item k="Carrier">{board.carrier}</Item>}
            {board?.temp && board.temp !== 'Ambient' && <Item k="Temperature">{board.temp}</Item>}
          </div>

          {stops.length > 0 && (
            <div>
              <div className="ui-label">Stops</div>
              {stops.map((s, i) => (
                <div key={i} className="ui-stop">
                  <div className={`ui-stop-kind ${s.kind === 'Pickup' ? 'pickup' : 'delivery'}`}>{s.kind}</div>
                  <div className="ui-stop-name">{s.name}</div>
                  <div className="ui-stop-meta">{s.address}</div>
                </div>
              ))}
            </div>
          )}

          <div className="ui-panel">
            <div className="ui-label" style={{ marginBottom: 10 }}>Rate</div>
            <div className="ui-rate-rows">
              <span>Line haul</span><span>{usd(Number(haul.rate))}</span>
              <span>Fuel surcharge</span><span>{usd(Number(fsc.rate))}</span>
              <strong>Total to bill</strong><strong>{usd(load.amount)}</strong>
            </div>
            {miles > 0 && <div className="ui-stop-meta">{usd(load.amount / miles)} per mile</div>}
          </div>

          <div className="ui-kv-grid">
            <Item k="Bill to">{[bill.attn, bill.email].filter(Boolean).join(' · ') || load.customer}</Item>
            <Item k="Terms">{termsFor(load.customer)}</Item>
          </div>
        </section>
        <footer className="ui-dialog-foot">
          {board && <Link className="ui-link" to={`/app/loads/${load.id}`} onClick={closeNow}>Open load page →</Link>}
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Close</button>
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => { closeNow(); onInvoice(); }}>New invoice</button>
        </footer>
      </div>
    </dialog>
  );
}
