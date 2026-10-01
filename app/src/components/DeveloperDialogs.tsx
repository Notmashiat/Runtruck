import { useCompanies } from '../lib/companyStore';
import { useModal } from './FormBits';
import { Tag } from './Tag';

const STEPS: [string, string][] = [
  ['Company', 'Which client company (Company ID) the account belongs to'],
  ['Person', 'Name, email and phone'],
  ['Access', 'Role (company admin or user) and a starting password they change at first login'],
];

// Create account, from the Developer top bar. The form is the next step; for
// now this says what it will ask for.
export function CreateAccountSoonDialog({ onClose }: { onClose: () => void }) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const companies = useCompanies();

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-compact"
      aria-label="Create account"
      onClose={(e) => { if (ownEvent(e)) onClose(); }}
      onCancel={(e) => ownEvent(e)}
    >
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Developer</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>Create account</h2>
            <div style={{ marginTop: 8 }}><Tag label="Coming next" tagClass="tag-accent" /></div>
            <p className="ui-p" style={{ marginTop: 12 }}>
              Add a login to a client company. Each account gets its own Member ID and belongs to one Company ID
              ({companies.length === 0 ? 'create a company first' : `${companies.length} compan${companies.length === 1 ? 'y' : 'ies'} to choose from`}).
            </p>
          </div>
          <div className="ui-kv-grid" style={{ gridTemplateColumns: '1fr' }}>
            {STEPS.map(([k, v]) => (
              <div key={k}>
                <div className="ui-label">{k}</div>
                <div className="ui-kv-value" style={{ fontWeight: 400 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="ui-btn ui-btn-primary" onClick={closeNow}>Got it</button>
          </div>
        </section>
      </div>
    </dialog>
  );
}
