// Writes an export as a real PDF, Word (.docx), Excel (.xlsx) or CSV file,
// with no outside libraries: .docx and .xlsx are zip packages of XML, put
// together by the small zip writer below.
import { PdfDoc, textWidth } from './pdf';

export interface ExportTable {
  title: string;
  note: string;
  columns: string[];
  rows: string[][];
}

export interface ExportDoc {
  title: string;
  subtitle: string;
  landscape: boolean;
  tables: ExportTable[];
}

export type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'csv';

// — zip (stored, no compression) —

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(d: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of d) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

export function zip(files: { name: string; data: Uint8Array | string }[]): Uint8Array {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = utf8(f.name);
    const data = typeof f.data === 'string' ? utf8(f.data) : f.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true); // UTF-8 names
    l.setUint16(10, time, true);
    l.setUint16(12, date, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const c = new DataView(cd.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(12, time, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, x) => n + x.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of all) {
    out.set(x, at);
    at += x.length;
  }
  return out;
}

// — XML —

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
// eslint-disable-next-line no-control-regex
const xml = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

// — Excel —

function colName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Plain numbers become numbers; IDs with leading zeros and anything else stay text.
const isNumber = (v: string) => /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v);

function sheetXml(columns: string[], rows: string[][]): string {
  const all = [columns, ...rows];
  const widths = columns.map((_, i) => Math.min(50, Math.max(8, ...all.map((r) => (r[i] ?? '').length + 2))));
  const cell = (v: string, r: number, c: number, head: boolean) => {
    const ref = `${colName(c)}${r + 1}`;
    if (!head && isNumber(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${head ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };
  const body = all.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cell(v ?? '', ri, ci, ri === 0)).join('')}</row>`).join('');
  return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData></worksheet>`;
}

export function xlsx(doc: ExportDoc): Uint8Array {
  // A first sheet saying what the export is, then one sheet per table.
  const about: ExportTable = {
    title: 'About this export', note: '', columns: [doc.title],
    rows: [[doc.subtitle], [''], ...doc.tables.map((t) => [`${t.title}: ${t.rows.length} row${t.rows.length === 1 ? '' : 's'}${t.note ? ` (${t.note})` : ''}`])],
  };
  const tables = [about, ...doc.tables];
  const used = new Set<string>();
  const names = tables.map((t) => {
    const base = t.title.replace(/[[\]:*?/\\]/g, ' ').slice(0, 28).trim() || 'Sheet';
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
  const n = tables.length;
  return zip([
    {
      name: '[Content_Types].xml',
      data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    { name: '_rels/.rels', data: `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    {
      name: 'xl/workbook.xml',
      data: `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${names.map((nm, i) => `<sheet name="${xml(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `${XML_HEAD}<Relationships xmlns="${PKG_REL}">${tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: 'xl/styles.xml',
      data: `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    },
    ...tables.map((t, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(t.columns, t.rows) })),
  ]);
}

// — Word —

const run = (s: string, o: { bold?: boolean; size?: number; color?: string } = {}) =>
  `<w:r><w:rPr>${o.bold ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.size ?? 20}"/></w:rPr><w:t xml:space="preserve">${xml(s)}</w:t></w:r>`;
const para = (inner: string, before = 0, after = 80) => `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}"/></w:pPr>${inner}</w:p>`;

export function docx(doc: ExportDoc): Uint8Array {
  const pageW = doc.landscape ? 15840 : 12240;
  const pageH = doc.landscape ? 12240 : 15840;
  const usable = pageW - 1440;
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>`;
  const cell = (s: string, head: boolean, w: number) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${run(s, { bold: head, size: 16 })}</w:p></w:tc>`;
  const tableXml = (t: ExportTable) => {
    if (t.rows.length === 0) return para(run('No records match.', { color: '6B7280', size: 18 }));
    const w = Math.floor(usable / t.columns.length);
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${t.columns.map(() => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr><w:trPr><w:tblHeader/></w:trPr>${t.columns.map((c) => cell(c, true, w)).join('')}</w:tr>${t.rows.map((r) => `<w:tr>${t.columns.map((_, i) => cell(r[i] ?? '', false, w)).join('')}</w:tr>`).join('')}</w:tbl>`;
  };
  const body = [
    para(run(doc.title, { bold: true, size: 36 }), 0, 60),
    para(run(doc.subtitle, { color: '6B7280', size: 18 }), 0, 200),
    ...doc.tables.map((t) =>
      [
        para(run(t.title, { bold: true, size: 26 }) + run(`  ${t.rows.length} row${t.rows.length === 1 ? '' : 's'}`, { color: '6B7280', size: 18 }), 240, 40),
        t.note ? para(run(t.note, { color: '6B7280', size: 16 }), 0, 80) : '',
        tableXml(t),
      ].join(''),
    ),
    '<w:p/>',
  ].join('');
  const sect = `<w:sectPr><w:pgSz w:w="${pageW}" w:h="${pageH}"${doc.landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`;
  return zip([
    {
      name: '[Content_Types].xml',
      data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    },
    { name: '_rels/.rels', data: `${XML_HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/document.xml', data: `${XML_HEAD}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${sect}</w:body></w:document>` },
  ]);
}

// — PDF —

function fit(s: string, width: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= width) return s;
  let cut = s;
  while (cut.length > 1 && textWidth(`${cut}…`, size, bold) > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

export function pdf(doc: ExportDoc): PdfDoc {
  const p = new PdfDoc(doc.title, doc.landscape);
  const W = p.w;
  const H = p.h;
  const M = 36;
  const SIZE = 7.5;
  const ROW = 13;
  const bottom = H - M - 18;
  let y = M + 14;
  p.text(M, y, doc.title, { size: 16, bold: true });
  y += 14;
  p.text(M, y, fit(doc.subtitle, W - 2 * M, 8), { size: 8, color: '#6b7280' });
  y += 20;

  for (const t of doc.tables) {
    if (y + 60 > bottom) {
      p.addPage();
      y = M + 10;
    }
    p.text(M, y, t.title, { size: 11, bold: true });
    p.text(M + textWidth(t.title, 11, true) + 8, y, `${t.rows.length} row${t.rows.length === 1 ? '' : 's'}${t.note ? ` · ${t.note}` : ''}`, { size: 8, color: '#6b7280' });
    y += 10;
    if (t.rows.length === 0) {
      p.text(M, y + 8, 'No records match.', { size: 8, color: '#6b7280' });
      y += 30;
      continue;
    }
    // Column widths follow the content, squeezed to the page if needed.
    const avail = W - 2 * M;
    const natural = t.columns.map((c, i) => Math.min(220, Math.max(textWidth(c, SIZE, true), ...t.rows.slice(0, 300).map((r) => textWidth(r[i] ?? '', SIZE))) + 8));
    const total = natural.reduce((a, b) => a + b, 0);
    const widths = total > avail ? natural.map((w) => Math.max(24, (w / total) * avail)) : natural;
    const head = () => {
      p.rect(M, y, widths.reduce((a, b) => a + b, 0), ROW, { fill: '#f3f4f6' });
      let x = M;
      t.columns.forEach((c, i) => {
        p.text(x + 4, y + 9, fit(c, widths[i] - 8, SIZE, true), { size: SIZE, bold: true });
        x += widths[i];
      });
      y += ROW;
    };
    head();
    for (const r of t.rows) {
      if (y + ROW > bottom) {
        p.addPage();
        y = M + 10;
        p.text(M, y, `${t.title} (continued)`, { size: 9, bold: true });
        y += 8;
        head();
      }
      let x = M;
      t.columns.forEach((_, i) => {
        p.text(x + 4, y + 9, fit(r[i] ?? '', widths[i] - 8, SIZE), { size: SIZE });
        x += widths[i];
      });
      p.line(M, y + ROW, M + widths.reduce((a, b) => a + b, 0), y + ROW);
      y += ROW;
    }
    y += 22;
  }

  // Page numbers once the count is known.
  const pages = p.pages.length;
  for (let i = 0; i < pages; i++) {
    p.goToPage(i);
    p.text(M, H - M + 6, `${doc.title} · RunTruck`, { size: 7, color: '#9ca3af' });
    p.text(W - M, H - M + 6, `Page ${i + 1} of ${pages}`, { size: 7, color: '#9ca3af', align: 'right' });
  }
  return p;
}

// — CSV —

export function csv(t: ExportTable): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [t.columns, ...t.rows].map((r) => r.map((v) => cell(v ?? '')).join(',')).join('\r\n');
}

// — saving —

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  zip: 'application/zip',
};

function save(data: Uint8Array | string, filename: string, ext: string) {
  const blob = new Blob([data as BlobPart], { type: MIME[ext] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'RunTruck export';

// Build the file in the chosen format and download it. Several tables as CSV
// come as a .zip with one CSV each. Returns the file name.
export function downloadExport(doc: ExportDoc, format: ExportFormat, name: string): string {
  const base = safeName(name);
  if (format === 'pdf') {
    save(pdf(doc).toPdf(), `${base}.pdf`, 'pdf');
    return `${base}.pdf`;
  }
  if (format === 'docx') {
    save(docx(doc), `${base}.docx`, 'docx');
    return `${base}.docx`;
  }
  if (format === 'xlsx') {
    save(xlsx(doc), `${base}.xlsx`, 'xlsx');
    return `${base}.xlsx`;
  }
  if (doc.tables.length === 1) {
    save(csv(doc.tables[0]), `${base}.csv`, 'csv');
    return `${base}.csv`;
  }
  save(zip(doc.tables.map((t) => ({ name: `${safeName(t.title)}.csv`, data: csv(t) }))), `${base}.zip`, 'zip');
  return `${base}.zip`;
}
