import { nextCompanyId } from '../data/companies';
import { useClients } from '../pages/app/developer/useClients';
import { useModal } from './FormBits';
import { Tag } from './Tag';

const PLANNED: Record<'company' | 'account', { title: string; about: (next: string) => string; steps: [string, string][] }> = {
  company: {
    title: 'Create company',
    about: (next: string) =>
      `Set up a new paying client. It gets Company ID ${next}, and its loads, fleet, invoices and settings are kept apart from every other company’s.`,
    steps: [
      ['Company', 'Name, legal name, USDOT and MC numbers, address, billing email and phone'],
      ['Subscription', 'Plan, monthly or annual billing, start date or free trial, payment method'],
      ['First admin', 'The company admin’s name and email, and a starting password'],
    ],
  },
  account: {
    title: 'Create account',
    about: () => 'Add a login to a client company. Each account gets its own Member ID and belongs to one Company ID.',
    steps: [
      ['Company', 'Which client company the account belongs to'],
      ['Person', 'Name, email and phone'],
      ['Access', 'Role (company admin or user) and a starting password they change at first login'],
    ],
  },
};

// Create company / Create account, from the Developer top bar. The forms are
// the next step; for now this says what each will ask for.
export function CreateSoonDialog({ kind, onClose }: { kind: 'company' | 'account'; onClose: () => void }) {
  const { ref, closeNow, ownEvent } = useModal(onClose);
  const companies = useClients();
  const plan = PLANNED[kind];

  return (
    <dialog
      ref={ref}
      className="ui-dialog is-compact"
      aria-label={plan.title}
      onClose={(e) => { if (ownEvent(e)) onClose(); }}
      onCancel={(e) => ownEvent(e)}
    >
      <div className="ui-dialog-main">
        <section className="ui-dialog-body">
          <button type="button" className="ui-dialog-close" onClick={closeNow} aria-label="Close">×</button>
          <div>
            <div className="ui-label">Developer</div>
            <h2 className="ui-h2" style={{ margin: '2px 0 0' }}>{plan.title}</h2>
            <div style={{ marginTop: 8 }}><Tag label="Coming next" tagClass="tag-accent" /></div>
            <p className="ui-p" style={{ marginTop: 12 }}>{plan.about(nextCompanyId(companies))}</p>
          </div>
          <div className="ui-kv-grid" style={{ gridTemplateColumns: '1fr' }}>
            {plan.steps.map(([k, v]) => (
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
