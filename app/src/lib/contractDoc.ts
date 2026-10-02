// A contract as a PDF: the agreed terms in plain sections, the clauses it
// includes, and signature lines for both sides (filled in once signed).
import { COMPANY, fmtDate, usd } from '../data/invoicing';
import { contractPay, currentEnd, isDriverRole, isLease, type ContractRecord } from '../data/hrRecords';
import { PAGE_H, PAGE_W, PdfDoc, wrap } from './pdf';

const M = 56;
const BOTTOM = PAGE_H - 70;

// What each clause says, in a sentence.
const CLAUSE_TEXT: Record<string, string> = {
  'At-will employment': 'Either party may end employment at any time, with or without cause, subject to the notice period above.',
  Confidentiality: 'Customer, rate, lane and company information stays confidential during and after the engagement.',
  'Non-solicitation': 'For 12 months after leaving, the worker will not solicit the Company’s customers or employees.',
  'Non-compete': 'Any restriction on competing applies only as far as the law of the worker’s state allows.',
  'Drug & alcohol policy (49 CFR 382)': 'The worker is subject to DOT drug and alcohol testing and the Company’s written policy under 49 CFR Part 382.',
  'Employee handbook acknowledged': 'The worker has received and agrees to follow the Company handbook.',
  'Damage / claim deductions authorized': 'Deductions for damage or cargo claims are made only as itemized in writing and as allowed by law.',
  'Escrow held and refunded (49 CFR 376.12(k))': 'Escrow is held in an account, earns interest as required, is itemized on settlements and is refunded within 45 days of the end of the lease.',
  'Equipment returned on exit': 'Company equipment (fuel card, ELD, keys, plates, devices) is returned on the last day.',
  'Arbitration of disputes': 'Disputes are settled by binding arbitration where the law allows.',
};

export function contractDoc(c: ContractRecord): PdfDoc {
  const p = new PdfDoc(`${c.agreement} ${c.person}`);
  const right = PAGE_W - M;
  let y = M + 6;

  const newPageIfNeeded = (need: number) => {
    if (y + need <= BOTTOM) return;
    p.addPage();
    y = M + 6;
  };
  const para = (s: string, size = 9.5, color = '#374151') => {
    for (const line of wrap(s, right - M, size)) {
      newPageIfNeeded(size + 4);
      p.text(M, y, line, { size, color });
      y += size + 4;
    }
  };
  const heading = (s: string) => {
    newPageIfNeeded(40);
    y += 10;
    p.text(M, y, s, { size: 11, bold: true });
    y += 6;
    p.line(M, y, right, y, '#d1d5db');
    y += 14;
  };
  const row = (label: string, value: string) => {
    if (!value) return;
    const lines = wrap(value, right - M - 170, 9.5);
    newPageIfNeeded(lines.length * 13 + 4);
    p.text(M, y, label, { size: 9, color: '#6b7280' });
    lines.forEach((l, i) => p.text(M + 170, y + i * 13, l, { size: 9.5 }));
    y += lines.length * 13 + 4;
  };

  p.text(M, y, COMPANY.legal, { size: 15, bold: true });
  p.text(right, y, c.id, { size: 9, color: '#6b7280', align: 'right' });
  y += 15;
  p.text(M, y, [COMPANY.street, `${COMPANY.city}, ${COMPANY.state} ${COMPANY.zip}`, COMPANY.phone].join(' · '), { size: 8.5, color: '#6b7280' });
  y += 30;
  p.text(PAGE_W / 2, y, c.agreement.replace(/ \(.*\)$/, '').toUpperCase(), { size: 13, bold: true, align: 'center' });
  y += 24;
  para(`This ${c.agreement.replace(/ \(.*\)$/, '').toLowerCase()} is between ${COMPANY.legal} ("the Company") and ${c.person} ("${isLease(c.agreement) ? 'the Contractor' : c.agreement.startsWith('Independent') ? 'the Contractor' : 'the Employee'}"), effective ${fmtDate(c.start)}.`, 10, '#111827');

  heading('Position and term');
  row('Role', `${c.role}${c.employment ? ` · ${c.employment}` : ''}`);
  row('Starts', fmtDate(c.start));
  const end = currentEnd(c);
  row('Term', c.termType === 'Fixed term' ? `${c.termLength}, to ${fmtDate(end || c.end)} · ${c.renewal.toLowerCase()}` : 'Ongoing until ended by either party');
  if (c.noticeDays) row('Notice to end', `${c.noticeDays} days in writing`);
  if (c.probationDays) row('Introductory period', `${c.probationDays} days, with a review at the end`);

  heading('Pay');
  row('Rate', contractPay(c));
  row('Paid', `${c.frequency}${isDriverRole(c.role) ? ', with a settlement statement listing loads, pay and deductions' : ''}`);
  if (c.signOnBonus) row('Sign-on bonus', usd(c.signOnBonus));
  if (c.benefits.length) row('Benefits', c.benefits.join(', '));
  if (c.ptoDays) row('Paid time off', `${c.ptoDays} days a year`);

  if (isDriverRole(c.role)) {
    heading(isLease(c.agreement) ? 'Equipment and lease terms' : 'Equipment and driving');
    row('Equipment', c.equipment);
    row('Truck', c.truck);
    if (c.leasePayment) row('Lease payment', `${usd(c.leasePayment)} each settlement`);
    if (c.escrow) row('Escrow', `${usd(c.escrow)}, held and refunded as below`);
    row('Fuel', c.fuel);
    row('Insurance', c.insurance.join('; '));
    row('Home time', c.homeTime);
    row('Region', c.region);
    if (isLease(c.agreement)) {
      y += 4;
      para('The Company has exclusive possession, control and use of the equipment for the term of the lease and assumes complete responsibility for its operation, as 49 CFR 376.12(c) requires. The Contractor receives a copy of the rated freight bill (or a computer-generated summary) for loads paid on a percentage, and every charge-back is itemized on the settlement.', 9);
    }
  }

  if (c.clauses.length) {
    heading('Clauses');
    for (const k of c.clauses) {
      newPageIfNeeded(30);
      p.text(M, y, `• ${k}`, { size: 9.5, bold: true });
      y += 13;
      if (CLAUSE_TEXT[k]) para(CLAUSE_TEXT[k], 9);
      y += 2;
    }
  }

  if (c.notes) {
    heading('Other terms');
    para(c.notes);
  }

  // Signatures.
  newPageIfNeeded(110);
  y += 24;
  const col = (x: number, who: string, name: string, title: string, signed: string) => {
    p.line(x, y + 30, x + 220, y + 30, '#111827');
    p.text(x, y + 22, signed ? `Signed ${fmtDate(signed)}` : '', { size: 9, color: '#047857' });
    p.text(x, y + 44, name || '—', { size: 10, bold: true });
    p.text(x, y + 57, [title, who].filter(Boolean).join(' · '), { size: 8.5, color: '#6b7280' });
    p.text(x, y + 70, `Date: ${signed ? fmtDate(signed) : '____________'}`, { size: 8.5, color: '#6b7280' });
  };
  col(M, 'for the Company', c.companySigner, c.signerTitle, c.companySigned);
  col(M + 260, '', c.person, isLease(c.agreement) ? 'Contractor' : c.agreement.startsWith('Independent') ? 'Contractor' : 'Employee', c.personSigned);

  // Footer on every page.
  p.pages.forEach((_, i) => {
    p.goToPage(i);
    p.text(M, PAGE_H - 36, `${c.id} · ${c.person} · prepared in RunTruck`, { size: 7.5, color: '#9ca3af' });
    p.text(right, PAGE_H - 36, `Page ${i + 1} of ${p.pages.length} · have counsel review before signing`, { size: 7.5, color: '#9ca3af', align: 'right' });
  });
  return p;
}
