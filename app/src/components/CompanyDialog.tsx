import { useState } from 'react';
import {
  BROKERS, BUSINESS_TYPES, COMPANY_TIME_ZONES, CYCLES, EQUIPMENT, PAYMENT_METHODS, PLANS, PLAN_NAMES, RUNS_TRUCKS, START_STATUSES, STATUSES,
  blankCompanyForm, companyFromForm, companyToForm, planFor, todayInZone, type ClientCompany, type Plan,
} from '../data/companies';
import type { FormValues } from '../data/fleet';
import { fmtDate } from '../data/invoicing';
import { useAccounts } from '../lib/accountStore';
import { deleteCompany, isIssued, newCompanyId, saveCompany, useCompanies } from '../lib/companyStore';
import { NON_NEGATIVE, PHONE, POSITIVE, STATE, ZIP } from '../lib/rules';
import { RecordDialog, type FieldSpec, type SectionSpec } from './RecordDialog';

const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const digits = (s: string) => s.replace(/\D/g, '');
const WHOLE = (value: string) => (/^\d+$/.test(value.trim()) ? null : 'A whole number');

// A field that is required only when `when` holds (e.g. USDOT for carriers).
function requiredWhen(f: FieldSpec, when: (v: FormValues) => boolean): FieldSpec[] {
  return [
    { ...f, required: true, show: (v) => when(v) },
    { ...f, required: false, show: (v) => !when(v) },
  ];
}

function companySections(isNew: boolean, others: ClientCompany[]): SectionSpec[] {
  const taken = (key: 'dot' | 'mc', value: string) => others.find((c) => c[key] && c[key] === digits(value));
  const runsTrucks = (v: FormValues) => RUNS_TRUCKS.includes(val(v, 'businessType'));
  const isBroker = (v: FormValues) => BROKERS.includes(val(v, 'businessType'));
  const trucks = (v: FormValues) => Number(val(v, 'trucks')) || 0;

  return [
    {
      title: 'Company',
      help: 'Who the client is, as registered with FMCSA and the IRS.',
      fields: [
        { key: 'name', label: 'Company name', required: true, help: 'The name customers and drivers know them by.' },
        { key: 'legal', label: 'Legal name', required: true, placeholder: 'e.g. Sunridge Freight LLC' },
        { key: 'businessType', label: 'Business type', type: 'select', required: true, options: BUSINESS_TYPES },
        ...requiredWhen({
          key: 'dot', label: 'USDOT number', placeholder: '7 digits',
          check: (value) => {
            if (!/^\d{5,8}$/.test(digits(value))) return '5–8 digits';
            const other = taken('dot', value);
            return other ? `Already on file for ${other.name} (${other.companyId})` : null;
          },
        }, runsTrucks),
        ...requiredWhen({
          key: 'mc', label: 'MC number', placeholder: 'e.g. 812044', help: 'Operating authority; brokers need one.',
          check: (value) => {
            if (!/^\d{5,7}$/.test(digits(value))) return '5–7 digits';
            const other = taken('mc', value);
            return other ? `Already on file for ${other.name} (${other.companyId})` : null;
          },
        }, isBroker),
        { key: 'ein', label: 'EIN', placeholder: '12-3456789', check: (value) => (digits(value).length === 9 ? null : '9 digits') },
        { key: 'scac', label: 'SCAC', upper: true, maxLength: 4, help: 'Standard carrier alpha code, if they have one.', check: (value) => (/^[A-Z]{2,4}$/i.test(value) ? null : '2–4 letters') },
        { key: 'website', label: 'Website', type: 'url', wide: true, placeholder: 'https://' },
      ],
    },
    {
      title: 'Address',
      help: 'The main office, and the time zone their RunTruck runs in.',
      fields: [
        { key: 'street', label: 'Street address', wide: true, required: true },
        { key: 'city', label: 'City', required: true },
        { key: 'state', label: 'State', required: true, maxLength: 2, upper: true, check: STATE, placeholder: 'CA' },
        { key: 'zip', label: 'ZIP', required: true, check: ZIP },
        { key: 'timeZone', label: 'Time zone', type: 'select', required: true, options: COMPANY_TIME_ZONES },
        { key: 'phone', label: 'Main phone', type: 'tel', required: true, check: PHONE, placeholder: '(209) 555-0100' },
      ],
    },
    {
      title: 'Contacts',
      help: 'Who RunTruck deals with. These are contacts, not logins: accounts are added to the company separately.',
      fields: [
        { key: 'contact', label: 'Main contact', required: true },
        { key: 'contactTitle', label: 'Title', placeholder: 'e.g. Owner, Operations manager' },
        { key: 'contactEmail', label: 'Contact email', type: 'email', required: true },
        { key: 'contactPhone', label: 'Contact phone', type: 'tel', required: true, check: PHONE },
        { key: 'billingName', label: 'Billing contact', help: 'If someone else pays the RunTruck bill.' },
        { key: 'billingEmail', label: 'Billing email', type: 'email', required: true, help: 'RunTruck invoices and receipts go here.' },
      ],
    },
    {
      title: 'Fleet',
      help: 'The size of the operation. Trucks set the plan and the price.',
      fields: [
        { key: 'trucks', label: 'Trucks (power units)', type: 'number', required: true, check: (value) => WHOLE(value) ?? NON_NEGATIVE(value) },
        { key: 'trailers', label: 'Trailers', type: 'number', check: (value) => WHOLE(value) ?? NON_NEGATIVE(value) },
        { key: 'drivers', label: 'Drivers', type: 'number', check: (value) => WHOLE(value) ?? NON_NEGATIVE(value) },
        { key: 'equipment', label: 'Equipment they run', type: 'checks', options: EQUIPMENT },
      ],
    },
    {
      title: 'Subscription',
      help: `Starter $${PLANS.Starter.perTruck} a truck a month (up to ${PLANS.Starter.maxTrucks} trucks) · Growth $${PLANS.Growth.perTruck} (up to ${PLANS.Growth.maxTrucks}) · Enterprise at a custom price.`,
      fields: [
        {
          key: 'plan', label: 'Plan', type: 'select', required: true, options: PLAN_NAMES,
          check: (value, v) => {
            const n = trucks(v);
            return n > PLANS[value as Plan].maxTrucks ? `${value} covers ${PLANS[value as Plan].fits.toLowerCase()}; ${n} trucks needs ${planFor(n)}` : null;
          },
        },
        { key: 'customPrice', label: 'Monthly price ($)', type: 'number', required: true, check: POSITIVE, show: (v) => val(v, 'plan') === 'Enterprise' },
        { key: 'cycle', label: 'Billing', type: 'select', required: true, options: CYCLES, help: 'Annual is billed once a year.' },
        { key: 'status', label: 'Status', type: 'select', required: true, options: isNew ? START_STATUSES : STATUSES, help: isNew ? 'Start on a free trial, or as a paying client.' : undefined },
        { key: 'started', label: 'Subscription starts', type: 'date', required: true, help: 'Billing renews on this day.' },
        {
          key: 'trialEnds', label: 'Trial ends', type: 'date', required: true, show: (v) => val(v, 'status') === 'Trial',
          check: (value, v) => (value > val(v, 'started') ? null : 'After the start date'),
        },
        ...requiredWhen({ key: 'paymentMethod', label: 'Payment method', type: 'select', options: PAYMENT_METHODS }, (v) => val(v, 'status') !== 'Trial'),
        { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Onboarding, special terms, who referred them…' },
      ],
    },
  ];
}

// Create company (or edit one) from Developer. A new company gets a random
// seven-digit Company ID that has never been issued. No login accounts are
// created: they are assigned to the company later.
export function CompanyDialog({ company, onClose }: { company?: ClientCompany; onClose: () => void }) {
  const companies = useCompanies();
  const [id] = useState(() => company?.companyId ?? newCompanyId());
  const [initial] = useState(() => (company ? companyToForm(company) : blankCompanyForm(todayInZone())));
  const others = companies.filter((c) => c.companyId !== id);
  const logins = useAccounts().filter((a) => a.companyId === id).length;

  const banner = (
    <div className="ui-note co-banner">
      <div><span className="ui-label">Company ID</span><strong className="co-id">{id}</strong></div>
      <div className="ui-stop-meta" style={{ marginTop: 0 }}>
        {company
          ? `Created ${fmtDate(company.created.slice(0, 10))} · ${logins} login account${logins === 1 ? '' : 's'}${logins ? ' (delete them before the company can be deleted)' : ''}`
          : 'Random and never issued before; it is the company’s for good. Creating the company creates no login accounts — they are assigned to it later.'}
      </div>
    </div>
  );

  return (
    <RecordDialog
      heading={company ? 'Edit company' : 'Create company'}
      saveLabel={company ? 'Save changes' : 'Create company'}
      sections={companySections(!company, others)}
      initial={initial}
      isNew={!company}
      recordLabel={company ? `${company.name} (${company.companyId})` : 'company'}
      noun="company"
      deleteNote={`${company?.name ?? 'The company'} leaves the client list. Company ID ${id} stays retired and is never given to another company.`}
      banner={banner}
      onSave={(v) => {
        // Another tab could have issued the same ID meanwhile: draw again if so.
        const cid = !company && isIssued(id) ? newCompanyId() : id;
        saveCompany(companyFromForm(v, cid, company));
      }}
      onDelete={company && logins === 0 ? () => deleteCompany(company.companyId) : undefined}
      onClose={onClose}
    />
  );
}
