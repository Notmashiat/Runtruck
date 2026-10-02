import { useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { driversOn } from '../data/driverStats';
import { normalizeLoad } from '../data/loads';
import { USER, stopsOf, type Load } from '../data/mock';
import { Field, useModal } from './FormBits';

// What the driver needs to run the load, ready to send.
export function loadMessage(l: Load): string {
  const stops = stopsOf(l).map((s) => `${s.kind}: ${[s.name, s.address].filter(Boolean).join(', ')} — ${s.when}`);
  return [
    `Load ${l.id}${l.customer ? ` (${l.customer})` : ''}`,
    ...stops,
    l.ref && l.ref !== '—' ? `Ref: ${l.ref}` : '',
    l.commodity && l.commodity !== '—' ? `Freight: ${[l.commodity, l.weight].filter((x) => x && x !== '—').join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

// A phone number as a link can carry it: digits, with +1 for a ten-digit US number.
export function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (phone.trim().startsWith('+')) return `+${digits}`;
  return digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : digits;
}

// Message driver: the load's details as a text or an email to its driver,
// sent from this device's own phone or mail app (RunTruck does not send
// messages itself), or a call. Opening one is noted in the load's history.
export function MessageDriverDialog({ load, onClose }: { load: Load; onClose: () => void }) {
  const { drivers, updateLoad } = useAppShell();
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const names = driversOn(load);
  const onRoster = drivers.filter((d) => !d.archived && names.includes(d.name));
  const [who, setWho] = useState(onRoster[0]?.id ?? '');
  const [text, setText] = useState(() => loadMessage(load));
  const [copied, setCopied] = useState(false);

  const driver = onRoster.find((d) => d.id === who);
  const detail = (k: string) => (driver && typeof driver.details[k] === 'string' ? (driver.details[k] as string).trim() : '');
  const phone = dialable(detail('phone'));
  const email = detail('email');
  const body = encodeURIComponent(text);

  const note = (how: string) => {
    if (!driver) return;
    updateLoad(normalizeLoad({ ...load, history: [...(load.history ?? []), { at: new Date().toISOString(), by: USER.name, what: `Opened ${how} to ${driver.name}` }] }));
  };
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false));
  };

  return (
    <dialog ref={ref} className="ui-dialog is-compact" aria-label={`Message driver: load ${load.id}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Message driver</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>Load {load.id}</h2>
            <p className="ui-p" style={{ marginTop: 4 }}>
              {driver
                ? 'The message opens in this device’s own text or mail app, addressed to the driver, for you to send.'
                : names.length
                  ? `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} not on the driver roster, so there is no phone or email to send to. Copy the message instead.`
                  : 'No driver is assigned to this load yet. Copy the message, or assign a driver with Edit load.'}
            </p>
          </div>
          {onRoster.length > 1 && (
            <Field label="Driver">
              <select className="ui-input" value={who} onChange={(e) => setWho(e.target.value)}>
                {onRoster.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
          {driver && (
            <div className="ui-note">
              <strong>{driver.name}</strong>
              <div className="ui-stop-meta" style={{ marginTop: 2 }}>{[detail('phone') || 'No phone on file', email || 'No email on file'].join(' · ')}</div>
            </div>
          )}
          <Field label="Message">
            <textarea className="ui-input" rows={7} value={text} onChange={(e) => { setText(e.target.value); setCopied(false); }} />
          </Field>
        </section>
        <footer className="ui-dialog-foot">
          <button type="button" className="ui-btn" onClick={copy}>{copied ? 'Copied' : 'Copy message'}</button>
          <div style={{ flex: 1 }} />
          {phone && <a className="ui-btn" style={{ textDecoration: 'none' }} href={`tel:${phone}`} onClick={() => note('a call')}>Call</a>}
          {email && <a className="ui-btn" style={{ textDecoration: 'none' }} href={`mailto:${email}?subject=${encodeURIComponent(`Load ${load.id}`)}&body=${body}`} onClick={() => note('an email')}>Email</a>}
          {phone && <a className="ui-btn ui-btn-primary" style={{ textDecoration: 'none' }} href={`sms:${phone}?&body=${body}`} onClick={() => note('a text')}>Text</a>}
          {!phone && !email && <button type="button" className="ui-btn ui-btn-primary" onClick={closeNow}>Done</button>}
        </footer>
      </div>
    </dialog>
  );
}
