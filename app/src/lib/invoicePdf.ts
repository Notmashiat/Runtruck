// The invoice document: one US Letter page (more if there are many charges)
// laid out like a carrier's official invoice. The same drawing feeds the PDF
// download and the on-screen preview.
import {
  COMPANY, fmtDate, invoiceTotal, lateFees, lineAmount, statusOf, usd, type InvoiceRecord,
} from '../data/invoicing';
import { PAGE_H, PAGE_W, PdfDoc, textWidth, wrap } from './pdf';
import { getSettings } from './settingsStore';

const BRAND = '#1e5eff';
const BRAND_SOFT = '#eef3ff';
const INK = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const PANEL = '#f8fafc';
const L = 48;
const R = PAGE_W - 48;
const W = R - L;
const BOTTOM = 700; // content stops here; the footer sits below

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export function invoiceFileName(inv: InvoiceRecord) {
  return `${inv.id} ${COMPANY.name}.pdf`;
}

export function invoiceDoc(inv: InvoiceRecord): PdfDoc {
  const doc = new PdfDoc(`Invoice ${inv.id} — ${COMPANY.legal}`);
  const status = statusOf(inv);
  const total = invoiceTotal(inv);
  const paid = inv.paid ? total : 0;
  const balance = total - paid;

  const label = (x: number, y: number, s: string, align: 'left' | 'right' = 'left') =>
    doc.text(x, y, s.toUpperCase(), { size: 7.5, bold: true, color: MUTED, align });

  // — letterhead —
  doc.rect(0, 0, PAGE_W, 6, { fill: BRAND });
  doc.rect(L, 34, 38, 38, { fill: BRAND });
  doc.text(L + 19, 58, initials(COMPANY.name), { size: 15, bold: true, color: '#ffffff', align: 'center' });
  doc.text(L + 50, 48, COMPANY.legal, { size: 15, bold: true, color: INK });
  doc.text(L + 50, 62, `${COMPANY.street}, ${COMPANY.city}, ${COMPANY.state} ${COMPANY.zip}`, { size: 8.5, color: MUTED });
  doc.text(L + 50, 73, [COMPANY.phone, COMPANY.email, COMPANY.website].filter(Boolean).join('  ·  '), { size: 8.5, color: MUTED });
  doc.text(L + 50, 84, [COMPANY.dot, COMPANY.mc].filter(Boolean).join('  ·  '), { size: 8.5, color: MUTED });

  doc.text(R, 56, 'INVOICE', { size: 26, bold: true, color: INK, align: 'right' });
  doc.text(R, 74, inv.id, { size: 11, bold: true, color: BRAND, align: 'right' });
  const stamp = status === 'Paid' ? ['PAID', '#167a3b'] : status === 'Overdue' ? ['PAST DUE', '#b42318'] : status === 'Draft' ? ['DRAFT', MUTED] : null;
  if (stamp) {
    const w = textWidth(stamp[0], 8, true) + 16;
    doc.rect(R - w, 81, w, 15, { stroke: stamp[1], lw: 1 });
    doc.text(R - w / 2, 91.5, stamp[0], { size: 8, bold: true, color: stamp[1], align: 'center' });
  }

  // — key facts strip —
  const top = 110;
  const cell = W / 4;
  doc.rect(L, top, W, 50, { fill: PANEL, stroke: BORDER });
  doc.rect(L + cell * 3, top, cell, 50, { fill: BRAND_SOFT, stroke: BORDER });
  const facts: [string, string][] = [
    ['Invoice date', fmtDate(inv.issued)],
    ['Due date', fmtDate(inv.due)],
    ['Terms', inv.terms],
    [status === 'Paid' ? 'Balance due' : 'Amount due', usd(balance)],
  ];
  facts.forEach(([k, v], i) => {
    const x = L + cell * i + 12;
    if (i > 0 && i < 3) doc.line(L + cell * i, top, L + cell * i, top + 50, BORDER);
    label(x, top + 18, k);
    doc.text(x, top + 37, v, { size: i === 3 ? 13 : 11, bold: true, color: i === 3 ? BRAND : INK });
  });

  // — bill to / shipment —
  let y = 190;
  label(L, y, 'Bill to');
  const b = inv.billTo;
  const billLines: [string, number, boolean][] = [
    [b.name || inv.customer, 11, true],
    [b.attn, 9, false],
    [b.street, 9, false],
    [[b.city, [b.state, b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), 9, false],
    [b.email, 9, false],
    [b.phone, 9, false],
  ];
  let ly = y + 16;
  for (const [s, size, bold] of billLines) {
    if (!s) continue;
    for (const part of wrap(s, 240, size, bold)) {
      doc.text(L, ly, part, { size, bold, color: bold ? INK : '#374151' });
      ly += size + 4;
    }
  }

  const sx = 318;
  const vx = 398;
  label(sx, y, 'Shipment');
  const ship: [string, string][] = [
    [inv.loads.length > 1 ? 'Loads' : 'Load #', inv.loads.join(', ')],
    ['Your reference', inv.ref],
    ['BOL #', inv.bol],
    ['Route', inv.route],
    ['Picked up', inv.pickup ? fmtDate(inv.pickup) : ''],
    ['Delivered', inv.delivery ? fmtDate(inv.delivery) : ''],
    ['Equipment', inv.equipment],
    ['Commodity', [inv.commodity, inv.weight].filter(Boolean).join(' · ')],
    ['Miles', inv.miles],
  ];
  let ry = y + 16;
  for (const [k, v] of ship) {
    if (!v) continue;
    doc.text(sx, ry, k, { size: 8.5, color: MUTED });
    for (const part of wrap(v, R - vx, 9)) {
      doc.text(vx, ry, part, { size: 9, color: INK });
      ry += 13;
    }
  }
  y = Math.max(ly, ry) + 18;

  // — charges —
  const qtyX = 372;
  const rateX = 462;
  const tableHead = () => {
    doc.rect(L, y, W, 22, { fill: BRAND_SOFT });
    label(L + 10, y + 14.5, 'Description');
    label(qtyX, y + 14.5, 'Qty', 'right');
    label(rateX, y + 14.5, 'Rate', 'right');
    label(R - 10, y + 14.5, 'Amount', 'right');
    y += 22;
  };
  const continuation = () => {
    doc.addPage();
    doc.rect(0, 0, PAGE_W, 6, { fill: BRAND });
    doc.text(L, 44, `${COMPANY.legal} · Invoice ${inv.id} (continued)`, { size: 10, bold: true, color: INK });
    y = 64;
  };
  tableHead();
  for (const line of inv.lines) {
    const desc = line.description ? wrap(line.description, 290, 8.5) : [];
    const h = 22 + desc.length * 11;
    if (y + h > BOTTOM) {
      continuation();
      tableHead();
    }
    doc.text(L + 10, y + 15, line.kind || 'Charge', { size: 9.5, bold: true, color: INK });
    desc.forEach((d, i) => doc.text(L + 10, y + 27 + i * 11, d, { size: 8.5, color: MUTED }));
    doc.text(qtyX, y + 15, line.qty || '0', { size: 9.5, color: INK, align: 'right' });
    doc.text(rateX, y + 15, usd(Number(line.rate) || 0), { size: 9.5, color: INK, align: 'right' });
    doc.text(R - 10, y + 15, usd(lineAmount(line)), { size: 9.5, bold: true, color: INK, align: 'right' });
    y += h;
    doc.line(L, y, R, y, BORDER);
  }

  // — totals and notes —
  const notes = inv.memo.trim() ? wrap(inv.memo.trim(), 270, 8.5) : [];
  const totalsH = 22 + 20 * (1 + (lateFees(inv) ? 1 : 0) + (paid ? 1 : 0)) + 30;
  if (y + Math.max(totalsH, 30 + notes.length * 11) + 10 > BOTTOM) continuation();
  y += 14;
  const tx = 356;
  let ty = y;
  const totalRow = (k: string, v: string) => {
    doc.text(tx + 10, ty + 12, k, { size: 9, color: MUTED });
    doc.text(R - 10, ty + 12, v, { size: 9.5, color: INK, align: 'right' });
    ty += 20;
  };
  totalRow('Subtotal', usd(total));
  if (lateFees(inv)) totalRow('Includes late fees', usd(lateFees(inv)));
  if (paid) totalRow(`Paid ${fmtDate(inv.paid?.date, true)} · ${inv.paid?.via ?? ''}`, usd(-paid));
  doc.rect(tx, ty + 2, R - tx, 30, { fill: BRAND });
  doc.text(tx + 10, ty + 21, 'BALANCE DUE', { size: 9, bold: true, color: '#ffffff' });
  doc.text(R - 10, ty + 22, usd(balance), { size: 13, bold: true, color: '#ffffff', align: 'right' });
  ty += 32;

  let ny = y;
  if (notes.length) {
    label(L, ny + 12, 'Notes');
    ny += 26;
    for (const n of notes) {
      doc.text(L, ny, n, { size: 8.5, color: '#374151' });
      ny += 11;
    }
  }
  y = Math.max(ty, ny) + 24;

  // — how to pay —
  const boxH = 100;
  if (y + boxH > BOTTOM + 20) continuation();
  doc.rect(L, y, W, boxH, { fill: PANEL, stroke: BORDER });
  label(L + 14, y + 18, 'How to pay');
  const payRows: [string, string][] = [
    ['ACH / wire', `${COMPANY.bank} · account ending ${COMPANY.accountLast4} · reference ${inv.id}`],
    ['Check', `Payable to ${COMPANY.legal}, ${COMPANY.remit}`],
    ['Questions', `${COMPANY.phone} · ${COMPANY.email}`],
  ];
  payRows.forEach(([k, v], i) => {
    doc.text(L + 14, y + 36 + i * 14, k, { size: 8.5, bold: true, color: INK });
    doc.text(L + 84, y + 36 + i * 14, v, { size: 8.5, color: '#374151' });
  });
  wrap([getSettings().invoicing.paymentNote, COMPANY.lateFeePct > 0 ? `Balances unpaid after the due date accrue a late fee of ${COMPANY.lateFeePct}% per month.` : ''].filter(Boolean).join(' '), W - 28, 7.5)
    .slice(0, 2)
    .forEach((s, i) => doc.text(L + 14, y + 80 + i * 9, s, { size: 7.5, color: MUTED }));

  // — footer on every page —
  const count = doc.pages.length;
  doc.pages.forEach((_, i) => {
    doc.goToPage(i);
    doc.line(L, PAGE_H - 46, R, PAGE_H - 46, BORDER);
    doc.text(L, PAGE_H - 30, getSettings().invoicing.footer, { size: 8.5, bold: true, color: INK });
    doc.text(R, PAGE_H - 30, `${inv.id}  ·  Page ${i + 1} of ${count}`, { size: 7.5, color: MUTED, align: 'right' });
    doc.text(PAGE_W / 2, PAGE_H - 18, [COMPANY.legal, COMPANY.dot, COMPANY.mc, 'Issued with RunTruck TMS'].filter(Boolean).join(' · '), { size: 7, color: '#9ca3af', align: 'center' });
  });
  doc.goToPage(count - 1);
  return doc;
}

// Several invoices in one PDF (a batch), each on its own page(s).
export function combinedDoc(title: string, list: InvoiceRecord[]): PdfDoc {
  const doc = new PdfDoc(title);
  const pages = list.flatMap((inv) => invoiceDoc(inv).pages);
  doc.pages = pages.length ? pages : [[]];
  return doc;
}
