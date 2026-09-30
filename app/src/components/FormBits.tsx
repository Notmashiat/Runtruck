import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react';

// Small pieces shared by the accounting popups.

export function Field({ label, required, error, wide, help, children }: {
  label: string;
  required?: boolean;
  error?: string | false;
  wide?: boolean;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className={`ui-field${wide ? ' is-wide' : ''}${error ? ' is-invalid' : ''}`}>
      <span className="ui-field-label">
        {label}
        {required && <span className="ui-req"> *</span>}
      </span>
      {children}
      {help && !error && <span className="ui-field-help">{help}</span>}
      {error && <span className="ui-field-error">{error}</span>}
    </label>
  );
}

export function Choice<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="ui-filter" style={{ alignSelf: 'flex-start' }}>
      {options.map((o) => (
        <button key={o} type="button" className={`ui-filter-opt${value === o ? ' is-active' : ''}`} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

// A native <dialog> opened as a modal on mount. `closeNow` closes it and tells
// the owner at once (the close event comes later, and never in hidden tabs).
// Events from dialogs nested inside stop at their own dialog.
export function useModal(onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  const closeNow = () => {
    ref.current?.close();
    onClose();
  };
  const ownEvent = (e: SyntheticEvent) => {
    const mine = e.target === e.currentTarget;
    e.stopPropagation();
    return mine;
  };
  return { ref, closeNow, ownEvent };
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// Open the person's email or messaging app with a message filled in.
export function launch(href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.rel = 'noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function mailtoHref(to: string, subject: string, body: string, cc = '') {
  const q = [cc && `cc=${encodeURIComponent(cc)}`, `subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`].filter(Boolean).join('&');
  return `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, '@')}?${q}`;
}

export function smsHref(phone: string, body: string) {
  const digits = phone.replace(/\D/g, '');
  const number = digits.length === 10 ? `+1${digits}` : digits ? `+${digits}` : '';
  return `sms:${number}?body=${encodeURIComponent(body)}`;
}
