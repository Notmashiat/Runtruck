import { useState } from 'react';
import {
  ALL_PERMS, PERM_TREE, TYPE_NAMES, permsFromForm, permsToForm, sectionField, syncTabs, tabsField, typeInfo,
  type Account, type AccountStatus, type AccountType,
} from '../data/accounts';
import type { FormValues } from '../data/fleet';
import { fmtDate } from '../data/invoicing';
import { reportError } from '../lib/errorLog';
import { dayOf } from '../lib/format';
import { OWNER_COMPANY_ID, OWNER_COMPANY_NAME } from '../lib/account';
import { USER } from '../data/mock';
import { companyVersionId } from '../lib/deactivate';
import { deleteAccount, isAccountIdIssued, newAccountId, saveAccount } from '../lib/accountStore';
import { emailTaken, me } from '../lib/auth';
import { companyById, companyName, useCompanies } from '../lib/companyStore';
import { makePasswordRecord, passwordProblems } from '../lib/password';
import { PHONE } from '../lib/rules';
import { RecordDialog, type SectionSpec } from './RecordDialog';

const val = (v: FormValues, k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '');
const RUNTRUCK = `${OWNER_COMPANY_ID} · ${OWNER_COMPANY_NAME}`;
const companyLabel = (id: string) => `${id} · ${companyName(id)}`;
const isSuper = (v: FormValues) => val(v, 'type') === 'Super admin';

function accountSections(isNew: boolean, accountId: string, self: boolean, companyOptions: string[]): SectionSpec[] {
  return [
    {
      title: 'Account',
      help: 'What kind of account this is, which company it belongs to, and who uses it.',
      fields: [
        {
          key: 'type', label: 'Account type', type: 'select', required: true, options: TYPE_NAMES, wide: true,
          help: 'Picking a type fills in its usual access; change it under Access.',
          check: (value) => (self && value !== 'Super admin' ? 'You can’t remove your own super admin access' : null),
        },
        {
          key: 'company', label: 'Company', type: 'select', required: true, options: companyOptions, wide: true, show: (v) => !isSuper(v),
          help: 'The account sees and edits this company’s data and nothing else.',
        },
        { key: 'name', label: 'Full name', required: true },
        { key: 'title', label: 'Job title', placeholder: 'e.g. Night dispatcher' },
        { key: 'phone', label: 'Phone', type: 'tel', check: PHONE },
        { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Why they have this access, who asked for it…' },
      ],
    },
    {
      title: 'Login',
      help: 'How they sign in. They can change their password later; only a RunTruck super admin can change their email.',
      fields: [
        {
          key: 'email', label: 'Login email', type: 'email', required: true, wide: true,
          check: (value) => (emailTaken(value, accountId) ? 'Another RunTruck account already uses this email' : null),
        },
        {
          key: 'password', label: isNew ? 'Password' : 'New password', type: 'password', required: isNew,
          help: isNew ? 'At least 10 characters, with letters and a number.' : 'Leave blank to keep their password. Passwords can be replaced, never read.',
          // The form trims values before checking; the password is checked as typed.
          check: (_value, v) => passwordProblems(String(v.password ?? ''), val(v, 'email')).join(' · ') || null,
        },
        {
          key: 'password2', label: 'Repeat password', type: 'password', required: true, show: (v) => typeof v.password === 'string' && v.password !== '',
          check: (value, v) => (value === v.password ? null : 'Does not match'),
        },
        {
          key: 'status', label: 'Status', type: 'select', required: true, options: ['Active', 'Deactivated'],
          help: 'A deactivated account cannot log in or get updates; it is listed in Developer › Deactivated.',
          check: (value, v) => {
            if (self && value === 'Deactivated') return 'You can’t deactivate your own account';
            const co = companyById(val(v, 'company').split(' · ')[0]);
            return value === 'Active' && !isSuper(v) && co?.deactivated ? `${co.name} is deactivated: reactivate the company first` : null;
          },
        },
      ],
    },
    {
      title: 'Access',
      help: 'Every account has the Dashboard and its own Profile, Security and Appearance settings. Tick everything else it may open; sections with tabs ask which tabs.',
      when: (v) => !isSuper(v),
      naText: 'Super admins have every section, tab and setting, plus Developer. They always belong to Company ID 1 (RunTruck).',
      fields: [
        { key: sectionField, label: 'Sections', type: 'checks', options: PERM_TREE.map((n) => n.label) },
        ...PERM_TREE.filter((n) => n.children.length).map((n) => ({
          key: tabsField(n.key), label: `${n.label}: which tabs`, type: 'checks' as const, required: true,
          options: n.children.map((c) => c.label),
          show: (v: FormValues) => Array.isArray(v[sectionField]) && (v[sectionField] as string[]).includes(n.label),
        })),
      ],
    },
  ];
}

// Picking a type fills in its preset access (super admins: Company ID 1);
// ticking a section ticks its tabs.
function adjust(prev: FormValues, next: FormValues, key: string): FormValues {
  if (key === 'type') {
    const type = val(next, 'type') as AccountType;
    const out = { ...next, ...permsToForm(typeInfo(type).preset) };
    if (type === 'Super admin') out.company = RUNTRUCK;
    else if (val(prev, 'type') === 'Super admin' && val(prev, 'company') === RUNTRUCK) out.company = '';
    return out;
  }
  if (key === sectionField) return syncTabs(prev, next);
  return next;
}

// Developer › Create account (or edit one). A new account gets a random
// ten-digit Account ID that has never been issued, belongs to one Company ID
// and opens only what is ticked under Access.
export function AccountDialog({ account, companyId, onClose }: { account?: Account; companyId?: string; onClose: () => void }) {
  const companies = useCompanies();
  const [id] = useState(() => account?.accountId ?? newAccountId());
  const self = Boolean(account && account.accountId === me()?.accountId);
  // Deactivated companies take no new accounts.
  const companyOptions = [RUNTRUCK, ...companies.filter((c) => !c.deactivated).map((c) => companyLabel(c.companyId))];
  const [initial] = useState<FormValues>(() =>
    account
      ? {
          type: account.type, company: account.type === 'Super admin' ? RUNTRUCK : companyLabel(account.companyId), name: account.name,
          title: account.title, phone: account.phone, notes: account.notes, email: account.email, password: '', password2: '',
          status: account.status, ...permsToForm(account.perms),
        }
      : {
          type: '', company: companyId ? companyLabel(companyId) : '', name: '', title: '', phone: '', notes: '',
          email: '', password: '', password2: '', status: 'Active', ...permsToForm([]),
        },
  );

  const when = (iso?: string) => (iso ? fmtDate(dayOf(iso)) : 'never');
  const banner = (
    <div className="ui-note co-banner">
      <div><span className="ui-label">Account ID</span><strong className="co-id">{id}</strong></div>
      <div className="ui-stop-meta" style={{ marginTop: 0 }}>
        {account
          ? `Created ${when(account.created)} · last sign-in ${when(account.lastSignIn)} · password set ${when(account.password.changed)} by ${account.password.by === 'self' ? 'them' : 'a super admin'}`
          : 'Random, ten digits and never issued before; it is the account’s for good.'}
      </div>
    </div>
  );

  const save = async (v: FormValues) => {
    const type = val(v, 'type') as AccountType;
    const password = typeof v.password === 'string' ? v.password : '';
    const now = new Date().toISOString();
    const record = password ? { ...(await makePasswordRecord(password)), by: 'admin' as const } : account?.password;
    if (!record) return;
    // Another tab could have issued the same ID meanwhile: draw again if so.
    const accountId = !account && isAccountIdIssued(id) ? newAccountId() : id;
    const companyId = type === 'Super admin' ? OWNER_COMPANY_ID : val(v, 'company').split(' · ')[0];
    const status = val(v, 'status') as AccountStatus;
    // Deactivating keeps the version the company runs now; reactivating clears it.
    const off = status === 'Deactivated'
      ? account?.status === 'Deactivated'
        ? { deactivatedAt: account.deactivatedAt, deactivatedBy: account.deactivatedBy, deactivatedWith: account.deactivatedWith, deactivatedVersion: account.deactivatedVersion }
        : { deactivatedAt: now, deactivatedBy: USER.name, deactivatedWith: 'account' as const, deactivatedVersion: companyVersionId(companyId) }
      : {};
    saveAccount({
      accountId,
      companyId,
      type,
      name: val(v, 'name'),
      title: val(v, 'title'),
      phone: val(v, 'phone'),
      email: val(v, 'email'),
      password: record,
      perms: type === 'Super admin' ? ALL_PERMS : permsFromForm(v),
      status,
      notes: val(v, 'notes'),
      created: account?.created ?? now,
      createdBy: account?.createdBy ?? me()?.accountId ?? '',
      updated: account ? now : undefined,
      lastSignIn: account?.lastSignIn,
      ...off,
    });
  };

  return (
    <RecordDialog
      heading={account ? 'Edit account' : 'Create account'}
      saveLabel={account ? 'Save changes' : 'Create account'}
      sections={accountSections(!account, id, self, companyOptions)}
      initial={initial}
      isNew={!account}
      recordLabel={account ? `${account.name} (${account.accountId})` : 'account'}
      noun="account"
      deleteNote={`${account?.name ?? 'They'} can no longer log in. Account ID ${id} stays retired and is never given to anyone else.`}
      banner={banner}
      adjust={adjust}
      onSave={(v) => {
        // Hashing the password can fail (e.g. the page is not on https): say so instead of saving nothing in silence.
        save(v).catch((e: unknown) => {
          reportError(e, { kind: 'promise', where: 'Account' });
          window.alert('The account could not be saved. Nothing was changed. Try again.');
        });
      }}
      onDelete={account && !self ? () => deleteAccount(account.accountId) : undefined}
      onClose={onClose}
    />
  );
}
