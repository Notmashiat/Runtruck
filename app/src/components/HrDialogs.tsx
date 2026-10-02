import { useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import type { BillDocument } from '../data/bills';
import { CDL_CLASSES, ENDORSEMENTS, TERMINALS, type FormValues } from '../data/fleet';
import {
  AGREEMENTS, BENEFITS, CLAUSES, CLOSE_REASONS, EMPLOYMENT_TYPES, END_REASONS, EQUIPMENT, EXPERIENCE, FUEL_TERMS, INSURANCE_TERMS, RENEWALS, SOURCES, STAGES,
  TERM_LENGTHS, TERM_TYPES, addMonths, agreementFor, blankContractForm, blankOnboardingForm, checklistFor, contractFromForm, contractToForm, currentEnd,
  agreementDefaults, defaultClauses, isDriverRole, isLease, nextContractId, nextOnboardingId, onboardingFromForm, onboardingToForm,
  type ContractRecord, type OnboardingRecord, type Step,
} from '../data/hrRecords';
import { fmtDate } from '../data/invoicing';
import { USER } from '../data/mock';
import { EMPLOYEE_ROLES, PAY_BASES, PAY_FREQUENCIES, WORKER_TYPES, type Employee } from '../data/payroll';
import { todayIso } from '../lib/clock';
import { PHONE, STATE } from '../lib/rules';
import { BillDocuments } from './BillDialogs';
import { Field, useTracked } from './FormBits';
import { RecordDialog, type SectionSpec } from './RecordDialog';
import { SmallDialog } from './SmallDialog';

const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const months = (t: string) => (Number(t.split(' ')[0]) || 0) * (t.includes('year') ? 12 : 1);
const money = (value: string) => (Number(value.replace(/[$,%]/g, '')) >= 0 ? null : 'A number');
const employeeLabel = (e: Pick<Employee, 'id' | 'name'>) => `${e.name} · ${e.id}`;

// A contract filled in from someone on payroll.
export function contractPrefillFromEmployee(e: Employee): FormValues {
  const agreement = agreementFor(e.role, e.workerType);
  return {
    employee: employeeLabel(e), employeeId: e.id, person: e.name, email: e.email, role: e.role, agreement, workerType: e.workerType,
    start: e.hired, payBasis: e.payBasis, rate: String(e.rate), frequency: e.frequency, clauses: defaultClauses(agreement, e.role),
  };
}

// — contracts —

function contractSections(employees: Employee[], trucks: string[]): SectionSpec[] {
  const fixed = (v: FormValues) => val(v, 'termType') === 'Fixed term';
  return [
    {
      title: 'Person & agreement',
      help: 'Who the contract is with and what kind of agreement it is.',
      fields: [
        { key: 'employee', label: 'On payroll', type: 'select', options: employees.map(employeeLabel), help: 'Pick someone on payroll to fill in their details, or leave it for a new hire.', wide: true },
        { key: 'person', label: 'Full name', required: true },
        { key: 'email', label: 'Email (for signing)', type: 'email' },
        { key: 'role', label: 'Role', type: 'select', required: true, options: EMPLOYEE_ROLES },
        { key: 'agreement', label: 'Agreement', type: 'select', required: true, options: AGREEMENTS, help: 'Owner-operator and lease-purchase drivers need a written lease (49 CFR 376.11).' },
        { key: 'employment', label: 'Employment', type: 'select', required: true, options: EMPLOYMENT_TYPES },
      ],
    },
    {
      title: 'Term',
      help: 'When it starts, how long it runs and how it ends.',
      fields: [
        { key: 'start', label: 'Start date', type: 'date', required: true },
        { key: 'termType', label: 'Term', type: 'select', required: true, options: TERM_TYPES },
        { key: 'termLength', label: 'Length', type: 'select', required: true, options: TERM_LENGTHS, show: fixed },
        { key: 'end', label: 'End date', type: 'date', required: true, show: fixed, help: 'Worked out from the start and length; change it if needed.', check: (value, v) => (value <= val(v, 'start') ? 'After the start date' : null) },
        { key: 'renewal', label: 'At the end', type: 'select', required: true, options: RENEWALS, show: fixed },
        { key: 'noticeDays', label: 'Notice to end (days)', type: 'number', check: money },
        { key: 'probationDays', label: 'Introductory period (days)', type: 'number', check: money, help: 'A review is due when it ends (e.g. 90).' },
      ],
    },
    {
      title: 'Pay & benefits',
      help: 'What they are paid and what comes with the job. Payroll uses the pay on the employee record.',
      fields: [
        { key: 'payBasis', label: 'Paid', type: 'select', required: true, options: PAY_BASES },
        { key: 'rate', label: 'Rate', type: 'number', required: true, help: 'Per mile: $ a mile · % of line haul: the percent · Per load · Hourly · Salary: $ a year', check: (value) => (Number(value.replace(/[$,%]/g, '')) > 0 ? null : 'More than 0') },
        { key: 'frequency', label: 'Pay schedule', type: 'select', required: true, options: PAY_FREQUENCIES },
        { key: 'signOnBonus', label: 'Sign-on bonus ($)', type: 'number', check: money },
        { key: 'ptoDays', label: 'Paid time off (days a year)', type: 'number', check: money },
        { key: 'benefits', label: 'Benefits', type: 'checks', options: BENEFITS },
      ],
    },
    {
      title: 'Equipment & lease',
      help: 'The truck, who pays for fuel and insurance, home time. Lease terms must be itemized (49 CFR 376.12).',
      when: (v) => isDriverRole(val(v, 'role')),
      naText: 'Only for drivers.',
      fields: [
        { key: 'equipment', label: 'Equipment', type: 'select', required: true, options: EQUIPMENT },
        { key: 'truck', label: 'Truck', type: 'select', options: trucks },
        { key: 'leasePayment', label: 'Lease payment per settlement ($)', type: 'number', check: money, show: (v) => isLease(val(v, 'agreement')) || val(v, 'equipment').startsWith('Leased') },
        { key: 'escrow', label: 'Escrow ($)', type: 'number', check: money, show: (v) => isLease(val(v, 'agreement')) },
        { key: 'fuel', label: 'Fuel', type: 'select', required: true, options: FUEL_TERMS },
        { key: 'homeTime', label: 'Home time', placeholder: 'e.g. Home every weekend' },
        { key: 'region', label: 'Region / lanes', placeholder: 'e.g. West Coast regional' },
        { key: 'insurance', label: 'Insurance', type: 'checks', options: INSURANCE_TERMS },
      ],
    },
    {
      title: 'Clauses',
      help: 'What the agreement includes. Changing the agreement type starts from its usual clauses.',
      fields: [{ key: 'clauses', label: 'Included', type: 'checks', options: CLAUSES }],
    },
    {
      title: 'Signatures',
      help: 'Who signs for the company. Send it and record signatures from the contract’s row.',
      fields: [
        { key: 'companySigner', label: 'Signs for the company', required: true },
        { key: 'signerTitle', label: 'Their title' },
      ],
    },
    {
      title: 'Documents & notes',
      help: 'The signed contract, amendments, the lease schedule.',
      fields: [{ key: 'notes', label: 'Other terms / notes', type: 'textarea' }],
    },
  ];
}

// New contract and Edit contract. `prefill` starts it from payroll or onboarding.
export function ContractDialog({ contract, prefill, onboardingId, onSaved, onClose }: {
  contract?: ContractRecord;
  prefill?: FormValues;
  onboardingId?: string;
  onSaved?: (id: string) => void;
  onClose: () => void;
}) {
  const { contracts, saveContract, deleteContract, employees, trucks } = useAppShell();
  const [id] = useState(() => contract?.id ?? nextContractId(contracts));
  const [docs, setDocs, docsChanged] = useTracked<BillDocument[]>(contract?.documents ?? []);
  const [ending, setEnding] = useState(false);
  const people = employees.filter((e) => e.status === 'Active' || e.id === contract?.employeeId);
  const [initial] = useState<FormValues>(() => {
    if (contract) {
      const e = employees.find((x) => x.id === contract.employeeId);
      return { ...contractToForm(contract), employee: e ? employeeLabel(e) : '' };
    }
    return { employee: '', ...blankContractForm(todayIso(), USER.name, prefill) };
  });

  // Picking someone fills in their details; the agreement and role bring their usual
  // terms (a lease: fixed term, line-haul pay, contractor insurance); the term works out the end date.
  const adjust = (_prev: FormValues, next: FormValues, key: string): FormValues => {
    let v = next;
    const role = val(v, 'role');
    if (key === 'employee') {
      const e = people.find((x) => employeeLabel(x) === val(v, 'employee'));
      if (!e) return { ...v, employeeId: '' };
      // On an existing contract this only links it to the person on payroll:
      // the agreed (perhaps signed) terms are not replaced by payroll's.
      if (contract) return { ...v, employeeId: e.id };
      const pre = contractPrefillFromEmployee(e);
      v = { ...v, ...agreementDefaults(val(pre, 'agreement'), e.role), ...pre };
    }
    if (key === 'agreement') v = { ...v, ...agreementDefaults(val(v, 'agreement'), role) };
    if (key === 'role') {
      const lease = isLease(val(v, 'agreement'));
      const agreement = role === 'Owner-operator' || role === 'Lease-purchase driver' ? agreementFor(role, '1099 contractor') : lease && !isDriverRole(role) ? AGREEMENTS[0] : val(v, 'agreement');
      v = agreement !== val(v, 'agreement')
        ? { ...v, agreement, ...agreementDefaults(agreement, role) }
        : {
            ...v, clauses: defaultClauses(agreement, role),
            ...(isDriverRole(role) && ['Salary', 'Hourly'].includes(val(v, 'payBasis')) ? { payBasis: 'Per mile', frequency: 'Weekly' } : {}),
            ...(!isDriverRole(role) && ['Per mile', '% of line haul', 'Flat per load'].includes(val(v, 'payBasis')) ? { payBasis: role === 'Mechanic' ? 'Hourly' : 'Salary', frequency: 'Every 2 weeks' } : {}),
          };
    }
    if (['start', 'termLength', 'termType', 'agreement', 'employee', 'role'].includes(key) && val(v, 'termType') === 'Fixed term' && val(v, 'start')) {
      v = { ...v, end: addMonths(val(v, 'start'), months(val(v, 'termLength')) || 12) };
    }
    return v;
  };

  return (
    <>
      <RecordDialog
        heading={contract ? `Edit ${contract.id}` : 'New contract'}
        saveLabel={contract ? 'Save changes' : 'Save draft'}
        sections={contractSections(people, trucks.filter((t) => !t.archived).map((t) => t.unit))}
        initial={initial}
        isNew={!contract}
        recordLabel={contract ? `${contract.id} (${contract.person})` : 'contract'}
        noun="contract"
        deleteNote="Removed for good, with its documents. Only drafts can be deleted; signed contracts are ended instead, so the record stays."
        adjust={adjust}
        extraDirty={docsChanged}
        banner={contract ? <div className="ui-stop-meta" style={{ marginTop: 0 }}>{contract.id} · {contract.status}{contract.status === 'Active' && contract.personSigned ? ` · signed ${fmtDate(contract.personSigned)}` : ''}</div> : undefined}
        extras={{
          Signatures: (v: FormValues) => (
            <div className="ui-note">
              {contract?.status === 'Active'
                ? `Signed by ${contract.person}${contract.personSigned ? ` ${fmtDate(contract.personSigned)}` : ''} and ${contract.companySigner}${contract.companySigned ? ` ${fmtDate(contract.companySigned)}` : ''}. Changing the terms of a signed contract is logged; send an amendment for signature if they change.`
                : `Saved as a draft. From its row: Download PDF, Send for signature${val(v, 'email') ? ` (to ${val(v, 'email')})` : ''}, then Record signatures when both sides have signed.`}
            </div>
          ),
          'Documents & notes': <BillDocuments docs={docs} onChange={setDocs} owner={contract?.person ?? 'New contract'} hint="Signed contract, amendments, lease schedule" />,
        }}
        footerExtra={contract && contract.status !== 'Ended' && contract.status !== 'Draft' ? <button type="button" className="ui-btn ui-btn-danger" onClick={() => setEnding(true)}>End contract</button> : undefined}
        onSave={(v) => {
          saveContract(contractFromForm(v, id, docs, USER.name, contract, contract ? {} : { onboardingId: onboardingId ?? '' }));
          onSaved?.(id);
        }}
        onDelete={contract && contract.status === 'Draft' ? () => deleteContract(contract.id) : undefined}
        onClose={onClose}
      />
      {ending && contract && <EndContractDialog contract={contract} onClose={() => setEnding(false)} onDone={onClose} />}
    </>
  );
}

const stamp = (by = USER.name) => ({ at: new Date().toISOString(), by });

export function EndContractDialog({ contract, onClose, onDone }: { contract: ContractRecord; onClose: () => void; onDone?: () => void }) {
  const { saveContract } = useAppShell();
  const [reason, setReason] = useState(END_REASONS[0]);
  const [on, setOn] = useState(todayIso());
  const [note, setNote] = useState('');
  return (
    <SmallDialog
      label={`End ${contract.id}`} title={contract.person} danger confirm="End contract"
      intro={`It moves to Ended contracts with why and when; the record and documents stay.${contract.noticeDays ? ` Notice period: ${contract.noticeDays} days.` : ''}`}
      disabled={!on}
      onConfirm={() => {
        const why = [reason, note.trim()].filter(Boolean).join(' · ');
        saveContract({ ...contract, status: 'Ended', endedOn: on, endReason: why, updated: new Date().toISOString(), log: [...contract.log, { ...stamp(), action: 'Ended', note: `${why} · last day ${fmtDate(on)}` }] });
        onDone?.();
      }}
      onClose={onClose}
    >
      <div className="ui-form-grid">
        <Field label="Why" required><select className="ui-input" value={reason} onChange={(e) => setReason(e.target.value)}>{END_REASONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Last day" required><input className="ui-input" type="date" max="9999-12-31" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
        <Field label="Note" wide help="Optional: final pay, equipment returned, escrow refund date…"><textarea className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </SmallDialog>
  );
}

export function SignaturesDialog({ contract, onClose }: { contract: ContractRecord; onClose: () => void }) {
  const { saveContract } = useAppShell();
  const [person, setPerson] = useState(contract.personSigned || todayIso());
  const [company, setCompany] = useState(contract.companySigned || todayIso());
  const both = Boolean(person && company);
  return (
    <SmallDialog
      label={`Record signatures · ${contract.id}`} title={contract.person} confirm={both ? 'Save · contract active' : 'Save'}
      intro="Enter the date each side signed. With both signatures the contract becomes active. Attach the signed copy on its row."
      onConfirm={() => {
        saveContract({
          ...contract, personSigned: person, companySigned: company, status: both ? 'Active' : 'Sent for signature', sentOn: contract.sentOn || todayIso(),
          updated: new Date().toISOString(),
          log: [...contract.log, { ...stamp(), action: both ? 'Signed' : 'Signature recorded', note: [person && `${contract.person} ${fmtDate(person)}`, company && `${contract.companySigner} ${fmtDate(company)}`].filter(Boolean).join(' · ') }],
        });
      }}
      onClose={onClose}
    >
      <div className="ui-form-grid">
        <Field label={`${contract.person} signed`}><input className="ui-input" type="date" max="9999-12-31" value={person} onChange={(e) => setPerson(e.target.value)} /></Field>
        <Field label={`${contract.companySigner || 'Company'} signed`}><input className="ui-input" type="date" max="9999-12-31" value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
      </div>
    </SmallDialog>
  );
}

export function RenewDialog({ contract, onClose }: { contract: ContractRecord; onClose: () => void }) {
  const { saveContract } = useAppShell();
  const from = currentEnd(contract) || contract.end || todayIso();
  const [end, setEnd] = useState(addMonths(from, months(contract.termLength) || 12));
  const [rate, setRate] = useState(String(contract.rate));
  const newRate = Number(rate.replace(/[$,%]/g, '')) || contract.rate;
  return (
    <SmallDialog
      label={`Renew ${contract.id}`} title={contract.person} confirm="Renew" disabled={!end || end <= from}
      intro={`Extends the term from ${fmtDate(from)}. A pay change here is logged; update Payroll too.`}
      onConfirm={() => {
        saveContract({
          ...contract, end, rate: newRate, status: 'Active', updated: new Date().toISOString(),
          log: [...contract.log, { ...stamp(), action: 'Renewed', note: `To ${fmtDate(end)}${newRate !== contract.rate ? ` · rate ${contract.rate} → ${newRate}` : ''}` }],
        });
      }}
      onClose={onClose}
    >
      <div className="ui-form-grid">
        <Field label="New end date" required><input className="ui-input" type="date" max="9999-12-31" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label={`Rate (${contract.payBasis.toLowerCase()})`}><input className="ui-input num" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
      </div>
    </SmallDialog>
  );
}

// — onboarding —

function onboardingSections(managers: string[]): SectionSpec[] {
  const driver = (v: FormValues) => isDriverRole(val(v, 'role'));
  return [
    {
      title: 'Candidate',
      help: 'Who is joining and how to reach them.',
      fields: [
        { key: 'name', label: 'Full name', required: true },
        { key: 'email', label: 'Email', type: 'email' },
        { key: 'phone', label: 'Phone', type: 'tel', check: PHONE },
        { key: 'city', label: 'City' },
        { key: 'state', label: 'State', maxLength: 2, upper: true, check: STATE },
        { key: 'source', label: 'Where they came from', type: 'select', options: SOURCES },
        { key: 'applied', label: 'Applied on', type: 'date', required: true },
      ],
    },
    {
      title: 'Position',
      help: 'The job, who runs the hire, and when they start.',
      fields: [
        { key: 'role', label: 'Role', type: 'select', required: true, options: EMPLOYEE_ROLES, help: 'Sets the checklist: drivers get the DOT qualification file.' },
        { key: 'workerType', label: 'Worker type', type: 'select', required: true, options: WORKER_TYPES },
        { key: 'manager', label: 'Hiring manager', type: 'select', required: true, options: managers },
        { key: 'terminal', label: 'Terminal', type: 'select', options: TERMINALS },
        { key: 'targetStart', label: 'Target start date', type: 'date', required: true, check: (value, v) => (value < val(v, 'applied') ? 'On or after the application' : null) },
        { key: 'payOffer', label: 'Pay offered', placeholder: 'e.g. $0.60 / mi, 75% of line haul, $55,000 / yr', help: 'Carried to payroll and the contract when they are hired.' },
      ],
    },
    {
      title: 'Driver qualifications',
      help: 'Their CDL and medical card, checked before they drive (49 CFR 391.11).',
      when: driver,
      naText: 'Only for drivers.',
      fields: [
        { key: 'cdlClass', label: 'CDL class', type: 'select', required: true, options: CDL_CLASSES },
        { key: 'cdlState', label: 'CDL state', maxLength: 2, upper: true, check: STATE },
        { key: 'cdlExpiry', label: 'CDL expires', type: 'date' },
        { key: 'medicalExpiry', label: 'Medical certificate expires', type: 'date' },
        { key: 'experienceYears', label: 'Years driving a CMV', type: 'number', check: money },
        { key: 'endorsements', label: 'Endorsements', type: 'checks', options: ENDORSEMENTS },
        { key: 'experience', label: 'Experience', type: 'checks', options: EXPERIENCE },
      ],
    },
    {
      title: 'Checklist',
      help: 'The steps for this role. Tick them off from the onboarding row; you can add your own.',
      fields: [],
    },
    {
      title: 'Documents & notes',
      help: 'Application, CDL copy, MVR, medical certificate, drug test result, I-9, W-4.',
      fields: [{ key: 'notes', label: 'Notes', type: 'textarea' }],
    },
  ];
}

function ChecklistPreview({ steps }: { steps: Step[] }) {
  return (
    <div className="onb-preview">
      {STAGES.filter((s) => steps.some((x) => x.stage === s)).map((stage) => (
        <div key={stage}>
          <div className="ui-label">{stage}</div>
          <ul>
            {steps.filter((x) => x.stage === stage).map((x) => (
              <li key={x.id} className={x.done ? 'is-done' : ''}>
                <span>{x.done ? '✓ ' : ''}{x.label}{x.required ? '' : ' (optional)'}</span>
                {x.rule && <span className="ui-stop-meta" style={{ marginTop: 0 }}>{x.rule}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Keep what was done when the role changes and the checklist is rebuilt.
function rebuild(prev: Step[], role: string, workerType: string): Step[] {
  const fresh = checklistFor(role, workerType);
  const kept = fresh.map((s) => {
    const old = prev.find((p) => p.label === s.label);
    return old ? { ...s, done: old.done, doneOn: old.doneOn, by: old.by, note: old.note } : s;
  });
  const custom = prev.filter((p) => p.id.startsWith('S-'));
  return [...kept, ...custom];
}

// Start onboarding and Edit onboarding.
export function OnboardingDialog({ onboarding, onClose }: { onboarding?: OnboardingRecord; onClose: () => void }) {
  const { onboardings, saveOnboarding, deleteOnboarding, employees } = useAppShell();
  const [id] = useState(() => onboarding?.id ?? nextOnboardingId(onboardings));
  const [docs, setDocs, docsChanged] = useTracked<BillDocument[]>(onboarding?.documents ?? []);
  const [initial] = useState<FormValues>(() => (onboarding ? onboardingToForm(onboarding) : blankOnboardingForm(todayIso(), USER.name)));
  const managers = [...new Set([USER.name, ...employees.filter((e) => e.status === 'Active' && !isDriverRole(e.role)).map((e) => e.name)])];
  // A new hire gets the checklist for their role. An existing one keeps its
  // checklist exactly as it is (steps removed or added by hand included)
  // unless the role or worker type changed, which rebuilds it.
  const stepsFor = (v: FormValues) => {
    if (!onboarding) return checklistFor(val(v, 'role'), val(v, 'workerType'));
    const same = val(v, 'role') === onboarding.role && val(v, 'workerType') === onboarding.workerType;
    return same ? onboarding.steps : rebuild(onboarding.steps, val(v, 'role'), val(v, 'workerType'));
  };

  const adjust = (_prev: FormValues, next: FormValues, key: string): FormValues => {
    if (key !== 'role') return next;
    const role = val(next, 'role');
    return { ...next, workerType: role === 'Owner-operator' || role === 'Lease-purchase driver' ? '1099 contractor' : 'W-2 employee' };
  };

  return (
    <RecordDialog
      heading={onboarding ? `Edit ${onboarding.name}` : 'Start onboarding'}
      saveLabel={onboarding ? 'Save changes' : 'Start onboarding'}
      sections={onboardingSections(managers)}
      initial={initial}
      isNew={!onboarding}
      recordLabel={onboarding ? onboarding.name : 'onboarding'}
      noun="onboarding"
      deleteNote="Removed for good, with its checklist and documents. To keep a record of a candidate who did not join, use Not hired / withdrawn instead."
      adjust={adjust}
      extraDirty={docsChanged}
      extras={{
        Checklist: (v: FormValues) => {
          const steps = stepsFor(v);
          const req = steps.filter((s) => s.required).length;
          return (
            <>
              <div className="ui-note">
                {req} required and {steps.length - req} optional steps for {/^[aeiou]/i.test(val(v, 'role')) ? 'an' : 'a'} {val(v, 'role').toLowerCase() || 'new hire'}{isDriverRole(val(v, 'role')) ? ': the driver qualification file (49 CFR 391), DOT drug and alcohol testing (49 CFR 382) and the paperwork to start' : ''}.
                {onboarding && ' Changing the role rebuilds it and keeps the steps already done.'}
              </div>
              <ChecklistPreview steps={steps} />
            </>
          );
        },
        'Documents & notes': <BillDocuments docs={docs} onChange={setDocs} owner={onboarding?.name ?? 'New hire'} hint="Application, CDL, MVR, medical certificate, drug test, I-9, W-4" />,
      }}
      onSave={(v) => saveOnboarding(onboardingFromForm(v, id, stepsFor(v), docs, USER.name, onboarding))}
      onDelete={onboarding ? () => deleteOnboarding(onboarding.id) : undefined}
      onClose={onClose}
    />
  );
}

export function CloseOnboardingDialog({ onboarding, onClose }: { onboarding: OnboardingRecord; onClose: () => void }) {
  const { saveOnboarding } = useAppShell();
  const [outcome, setOutcome] = useState<'Not hired' | 'Withdrawn'>('Not hired');
  const [reason, setReason] = useState(CLOSE_REASONS['Not hired'][0]);
  const [note, setNote] = useState('');
  return (
    <SmallDialog
      label="Close onboarding" title={onboarding.name} danger confirm={outcome === 'Not hired' ? 'Not hired' : 'Withdrawn'}
      intro="It moves to Closed with why, when and who decided, with its checklist and documents, so the decision is on record. You can reopen it later."
      onConfirm={() => {
        const why = [reason, note.trim()].filter(Boolean).join(' · ');
        saveOnboarding({ ...onboarding, status: outcome, closedOn: todayIso(), closedReason: why, updated: new Date().toISOString(), log: [...onboarding.log, { ...stamp(), action: outcome, note: why }] });
      }}
      onClose={onClose}
    >
      <div className="ui-form-grid">
        <Field label="Outcome" required>
          <select className="ui-input" value={outcome} onChange={(e) => { const o = e.target.value as 'Not hired' | 'Withdrawn'; setOutcome(o); setReason(CLOSE_REASONS[o][0]); }}>
            <option>Not hired</option><option>Withdrawn</option>
          </select>
        </Field>
        <Field label="Why" required><select className="ui-input" value={reason} onChange={(e) => setReason(e.target.value)}>{CLOSE_REASONS[outcome].map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Note" wide><textarea className="ui-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </SmallDialog>
  );
}
