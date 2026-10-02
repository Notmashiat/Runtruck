import { describe, expect, it } from 'vitest';
import type { InvoiceRecord } from '../data/invoicing';
import { invoiceDoc } from './invoicePdf';
import { PAGE_H, PAGE_W, textWidth, type Op } from './pdf';

const invoice = (more: Partial<InvoiceRecord>): InvoiceRecord => ({
  id: 'INV-1042', draft: false, customer: 'Northgate Foods',
  billTo: { name: 'Northgate Foods', attn: 'Accounts payable', street: '1 Market St', city: 'Fresno', state: 'CA', zip: '93721', email: 'ap@northgate.example', phone: '(559) 555-0100' },
  loads: ['L-1'], ref: 'PO 1', bol: 'BOL 1', route: 'Fresno, CA → Reno, NV', pickup: '2026-09-28', delivery: '2026-09-29',
  equipment: 'Reefer', commodity: 'Produce', weight: '40,000 lb', miles: '300',
  issued: '2026-09-30', terms: 'Net 30', due: '2026-10-30',
  lines: [{ kind: 'Line haul', description: 'L-1 · Fresno, CA → Reno, NV', qty: '1', rate: '2000' }],
  memo: '', internal: '', history: [],
  ...more,
});

// Text must stay on the paper, and out of the strip between the content and the footer.
const FOOTER_TOP = PAGE_H - 46;
function offThePage(pages: Op[][]): string[] {
  const bad: string[] = [];
  pages.forEach((ops, page) => {
    for (const op of ops) {
      if (op.t !== 'text') continue;
      const right = op.x + textWidth(op.s, op.size, op.bold);
      if (op.x < 0 || right > PAGE_W + 0.5) bad.push(`page ${page + 1}: "${op.s.slice(0, 30)}" runs off the side`);
      if (op.y > PAGE_H) bad.push(`page ${page + 1}: "${op.s.slice(0, 30)}" is below the paper`);
      if (op.y > 724 && op.y < FOOTER_TOP) bad.push(`page ${page + 1}: "${op.s.slice(0, 30)}" runs into the footer`);
    }
  });
  return bad;
}

describe('invoice PDF', () => {
  it('fits an ordinary invoice on one page', () => {
    const doc = invoiceDoc(invoice({}));
    expect(doc.pages).toHaveLength(1);
    expect(offThePage(doc.pages)).toEqual([]);
  });

  it('carries many charges over to more pages', () => {
    const lines = Array.from({ length: 90 }, (_, i) => ({ kind: 'Line haul', description: `L-${i} · Fresno, CA → Reno, NV · 300 mi`, qty: '1', rate: '2000' }));
    const doc = invoiceDoc(invoice({ lines }));
    expect(doc.pages.length).toBeGreaterThan(2);
    expect(offThePage(doc.pages)).toEqual([]);
  });

  it('carries very long notes over to more pages', () => {
    const memo = Array.from({ length: 160 }, (_, i) => `Note ${i + 1}: detention was agreed with the receiver by phone before the delivery.`).join('\n');
    const doc = invoiceDoc(invoice({ memo }));
    expect(doc.pages.length).toBeGreaterThan(1);
    expect(offThePage(doc.pages)).toEqual([]);
    const text = doc.pages.flat().filter((op) => op.t === 'text').map((op) => (op.t === 'text' ? op.s : ''));
    expect(text.some((s) => s.startsWith('Note 160:'))).toBe(true);
  });

  it('keeps an invoice for very many loads, with long names, on the paper', () => {
    const doc = invoiceDoc(invoice({
      id: 'INVOICE-NUMBER-THAT-IS-VERY-LONG-INDEED-000000001042',
      loads: Array.from({ length: 400 }, (_, i) => `L-${40000 + i}`),
      terms: 'Net 45 from receipt of original proof of delivery',
      route: 'A very long description of a route with many stops '.repeat(6),
      lines: [{ kind: 'A charge with a name much longer than the column it is printed in, to be shortened', description: 'x', qty: '1', rate: '10' }],
    }));
    expect(offThePage(doc.pages)).toEqual([]);
  });
});
