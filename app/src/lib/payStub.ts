// Pay statements (pay stubs) as PDF: one page per person in a pay run.
import { COMPANY, fmtDate, usd } from '../data/invoicing';
import { payLabel, unitsText, type Employee, type PayLine, type PayRun } from '../data/payroll';
import { PAGE_W, PdfDoc } from './pdf';

const M = 48;

function statement(p: PdfDoc, run: PayRun, line: PayLine, e: Employee | undefined, ytd: { gross: number; net: number }) {
  const right = PAGE_W - M;
  let y = M + 10;
  p.text(M, y, COMPANY.name, { size: 16, bold: true });
  p.text(right, y, 'Pay statement', { size: 16, bold: true, align: 'right' });
  y += 16;
  p.text(M, y, [COMPANY.street, `${COMPANY.city}, ${COMPANY.state} ${COMPANY.zip}`].filter(Boolean).join(' · '), { size: 9, color: '#6b7280' });
  p.text(right, y, `${run.id} · ${line.hold ? 'ON HOLD' : run.status}`, { size: 9, color: '#6b7280', align: 'right' });
  y += 26;

  // Who and when.
  p.rect(M, y, right - M, 64, { fill: '#f3f4f6' });
  const col = (x: number, label: string, value: string, sub = '') => {
    p.text(x, y + 18, label.toUpperCase(), { size: 7.5, bold: true, color: '#6b7280' });
    p.text(x, y + 34, value, { size: 11, bold: true });
    if (sub) p.text(x, y + 50, sub, { size: 8.5, color: '#6b7280' });
  };
  col(M + 14, 'Pay to', line.name, [line.role, e?.workerType].filter(Boolean).join(' · '));
  col(M + 214, 'Pay period', `${fmtDate(run.start)} – ${fmtDate(run.end)}`, run.frequency);
  col(M + 384, 'Pay date', fmtDate(run.payDate), e ? `${e.method}${e.accountLast4 ? ` ····${e.accountLast4}` : ''}` : '');
  y += 92;

  const head = (title: string) => {
    p.text(M, y, title, { size: 10, bold: true });
    p.text(right, y, 'Amount', { size: 8, bold: true, color: '#6b7280', align: 'right' });
    y += 6;
    p.line(M, y, right, y, '#d1d5db');
    y += 14;
  };
  const row = (label: string, amount: string, sub = '') => {
    p.text(M, y, label, { size: 9.5 });
    p.text(right, y, amount, { size: 9.5, align: 'right' });
    if (sub) {
      y += 12;
      p.text(M + 10, y, sub, { size: 8, color: '#6b7280' });
    }
    y += 16;
  };

  head('Earnings');
  const units = line.basis === 'Salary' ? '' : unitsText(line);
  row(`${line.basis}${e ? ` (${payLabel(e)})` : ''}`, usd(line.gross), [units, line.loads.length ? `Loads: ${line.loads.join(', ')}` : ''].filter(Boolean).join(' · '));
  for (const i of line.items.filter((x) => x.kind !== 'Deduction')) row(`${i.label} (${i.kind.toLowerCase()})`, usd(i.amount));
  y += 6;
  head('Deductions');
  const ded = line.items.filter((x) => x.kind === 'Deduction');
  for (const i of ded) row(i.label, `-${usd(i.amount)}`);
  if (line.tax) row('Tax withholding (estimate)', `-${usd(line.tax)}`);
  if (!ded.length && !line.tax) row('None', usd(0));
  y += 10;

  p.rect(M, y, right - M, 44, { fill: '#eef2ff' });
  p.text(M + 14, y + 27, 'Net pay', { size: 13, bold: true });
  p.text(right - 14, y + 28, usd(line.net), { size: 18, bold: true, align: 'right' });
  y += 70;
  p.text(M, y, `Year to date (${run.payDate.slice(0, 4)}, through this pay)`, { size: 10, bold: true });
  y += 16;
  row('Gross pay', usd(ytd.gross));
  row('Net pay (RunTruck pay runs)', usd(ytd.net));
  if (line.note) {
    y += 6;
    p.text(M, y, `Note: ${line.note}`, { size: 9, color: '#374151' });
  }
  p.text(M, 760, `${COMPANY.name} · ${COMPANY.phone} · ${COMPANY.email}`, { size: 7.5, color: '#9ca3af' });
  p.text(right, 760, 'Tax withholding is an estimate; confirm with your payroll provider.', { size: 7.5, color: '#9ca3af', align: 'right' });
}

// One person's statement, or the whole run (one page each).
// `ytdOf` gives the year-to-date figures to print for a line (as of this run).
export function payStubDoc(run: PayRun, lines: PayLine[], employees: Employee[], ytdOf: (line: PayLine, e: Employee | undefined) => { gross: number; net: number }): PdfDoc {
  const p = new PdfDoc(lines.length === 1 ? `Pay statement ${lines[0].name} ${run.id}` : `Pay statements ${run.id}`);
  lines.forEach((l, i) => {
    if (i) p.addPage();
    const e = employees.find((x) => x.id === l.employeeId);
    statement(p, run, l, e, ytdOf(l, e));
  });
  return p;
}
