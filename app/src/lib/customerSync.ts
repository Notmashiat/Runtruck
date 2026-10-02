import { STANDING_TAG, type CustomerRecord } from '../data/customers';
import { BILLING } from '../data/invoicing';
import { CUSTOMERS } from '../data/mock';

// The customer pickers (New Load, invoices, batches, facilities) and the
// billing details on invoices read CUSTOMERS and BILLING. Keep them in step
// with the CRM records: active customers in the pickers, and every
// customer's billing details (old invoices may name an inactive one).
export function syncCustomers(list: CustomerRecord[]) {
  const thousands = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}K` : `$${n}`);
  CUSTOMERS.splice(
    0,
    CUSTOMERS.length,
    ...list
      .filter((c) => c.status === 'Active')
      .map((c) => ({
        name: c.name,
        contact: c.contact,
        loads: String(c.history?.loads ?? 0),
        revenue: thousands(c.history?.revenue ?? 0),
        onTime: c.history ? `${c.history.onTime}%` : '—',
        terms: c.terms,
        ar: '',
        tier: c.standing,
        tagClass: STANDING_TAG[c.standing] ?? 'tag-neutral',
      })),
  );
  for (const c of list) {
    BILLING[c.name] = {
      name: c.billTo || c.name, attn: c.attn, street: c.street, city: c.city, state: c.state, zip: c.zip, email: c.billingEmail, phone: c.billingPhone,
    };
  }
}
