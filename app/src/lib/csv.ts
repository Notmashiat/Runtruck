// A number as people write it: 12, -4.50, $1,200.00, 15%.
const NUMBER_LIKE = /^[+-]?\$?[\d,]*\.?\d+%?$/;

// One CSV cell.
//
// Text that starts with = + - or @ is read by Excel and Google Sheets as a
// formula, so a customer name typed as `=HYPERLINK(...)` would run on
// whoever opens the export. Such text gets a leading apostrophe, which makes
// the spreadsheet treat it as plain text. Real numbers are left alone.
export function csvCell(v: string | number | undefined | null): string {
  let s = String(v ?? '');
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s) && !NUMBER_LIKE.test(s.trim())) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Rows as CSV text. The byte-order mark at the start makes Excel read
// accents and symbols correctly.
export const csvText = (rows: (string | number | undefined | null)[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

// Download rows as a CSV file (opens in Excel, Numbers or Google Sheets).
export function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const blob = new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
