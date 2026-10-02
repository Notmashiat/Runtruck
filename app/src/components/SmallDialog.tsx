import type { ReactNode } from 'react';
import { useModal } from './FormBits';

// A small popup for one decision with a few fields: a label and title, the
// fields, then Cancel and the action. Used for "End contract", "Record
// payment", "Update status" and the like.
export function SmallDialog({ label, title, intro, children, confirm, danger, disabled, onConfirm, onClose }: {
  label: string;
  title: string;
  intro?: string;
  children?: ReactNode;
  confirm: string;
  danger?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  return (
    <dialog ref={ref} className="ui-dialog is-compact" aria-label={`${label}: ${title}`} onClose={(e) => { if (ownEvent(e)) onClose(); }} onCancel={(e) => ownEvent(e)}>
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">{label}</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{title}</h2>
            {intro && <p className="ui-p" style={{ marginTop: 4 }}>{intro}</p>}
          </div>
          {children}
        </section>
        <footer className="ui-dialog-foot">
          <div style={{ flex: 1 }} />
          <button type="button" className="ui-btn" onClick={closeNow}>Cancel</button>
          <button type="button" className={`ui-btn ${danger ? 'ui-btn-danger-solid' : 'ui-btn-primary'}`} disabled={disabled} onClick={() => { onConfirm(); closeNow(); }}>{confirm}</button>
        </footer>
      </div>
    </dialog>
  );
}
