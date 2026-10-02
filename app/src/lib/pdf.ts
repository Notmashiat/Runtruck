// A small page-drawing kit that writes real PDF files with no dependencies.
// Pages are recorded as a list of drawing operations (text, boxes, lines) in
// points with the origin at the top-left, so the same pages can be written as
// a PDF (toPdf) or drawn on screen as SVG (see components/PdfPages.tsx) and
// look the same. Text uses the PDF standard fonts Helvetica and
// Helvetica-Bold, which every PDF reader has, with the Windows-1252 character
// set; widths come from the fonts' published metrics so right-aligned numbers
// line up.

export const PAGE_W = 612; // US Letter, 8.5 × 11 in
export const PAGE_H = 792;

export type Op =
  | { t: 'text'; x: number; y: number; s: string; size: number; bold: boolean; color: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lw: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; lw: number };

// Helvetica and Helvetica-Bold advance widths (1/1000 em) for ' ' … '~'.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELV_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889,
  611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Characters outside ASCII that Windows-1252 has: code, regular width, bold width.
const EXTRA: Record<string, [number, number, number]> = {
  '·': [0xb7, 278, 278], '—': [0x97, 1000, 1000], '–': [0x96, 556, 556], '’': [0x92, 222, 278], '‘': [0x91, 222, 278],
  '“': [0x93, 333, 500], '”': [0x94, 333, 500], '•': [0x95, 350, 350], '°': [0xb0, 400, 400], '…': [0x85, 1000, 1000],
  '×': [0xd7, 584, 584], 'é': [0xe9, 556, 556], 'ñ': [0xf1, 556, 611], '©': [0xa9, 737, 737],
};

const MARKS = /[\u0300-\u036f]/g;
// A letter without its accent ('é' gives 'e'); '' when it has no plain form.
const plain = (c: string) => c.normalize('NFD').replace(MARKS, '');

// One character as the fonts can print it.
function printable(c: string): string {
  const code = c.charCodeAt(0);
  if (code >= 32 && code <= 126) return c;
  if (c === '\t' || c === '\n' || code === 0xa0) return ' ';
  if (EXTRA[c]) return c;
  // Western European letters and signs (À–ÿ, ¡ ¿ £ § and so on) print as they are.
  if (c.length === 1 && code >= 0xa1 && code <= 0xff) return c;
  // Other accented letters (Š, ł, ő) print without the accent rather than as '?'.
  const base = plain(c);
  return base && /^[\x20-\x7e]+$/.test(base) ? base : '?';
}

// Replace what the fonts cannot show, so screen and PDF print the same text.
export function sanitize(s: string): string {
  let out = '';
  for (const c of s.replace(/→/g, 'to').normalize('NFC')) out += printable(c);
  return out;
}

// Widths of the few Western European characters that are not a plain letter with an accent.
const WIDE: Record<string, number> = { 'Æ': 1000, 'æ': 889, 'Ø': 778, 'ø': 611, 'ß': 611, 'Þ': 667, 'þ': 556, 'Ð': 722, 'ð': 556 };

function charWidth(c: string, bold: boolean): number {
  const widths = bold ? HELV_BOLD : HELV;
  const code = c.charCodeAt(0);
  if (code >= 32 && code <= 126) return widths[code - 32];
  const e = EXTRA[c];
  if (e) return bold ? e[2] : e[1];
  if (WIDE[c]) return WIDE[c];
  // An accented letter is as wide as the letter under the accent.
  const base = plain(c).charCodeAt(0);
  return base >= 32 && base <= 126 ? widths[base - 32] : 556;
}

export function textWidth(s: string, size: number, bold = false): number {
  let w = 0;
  for (const c of sanitize(s)) w += charWidth(c, bold);
  return (w * size) / 1000;
}

// The text, shortened with '…' when it is wider than `width`. Finds the cut
// by halving, so a very long note costs a handful of measurements, not one
// per character.
export function fit(s: string, width: number, size: number, bold = false): string {
  if (textWidth(s, size, bold) <= width) return s;
  let lo = 1;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(`${s.slice(0, mid)}…`, size, bold) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo)}…`;
}

// Break text into lines no wider than `width`, at spaces.
export function wrap(s: string, width: number, size: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, bold) > width) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export interface TextOpts {
  size?: number;
  bold?: boolean;
  color?: string;
  align?: 'left' | 'right' | 'center';
}

export class PdfDoc {
  pages: Op[][] = [[]];
  title: string;
  // Page size in points: US Letter, portrait unless asked for landscape.
  w = PAGE_W;
  h = PAGE_H;
  private cur = 0;

  constructor(title: string, landscape = false) {
    this.title = title;
    if (landscape) {
      this.w = PAGE_H;
      this.h = PAGE_W;
    }
  }

  private get ops() {
    return this.pages[this.cur];
  }

  addPage() {
    this.pages.push([]);
    this.cur = this.pages.length - 1;
  }

  // Draw on an earlier page again (e.g. footers once the page count is known).
  goToPage(i: number) {
    this.cur = i;
  }

  // `y` is the text baseline.
  text(x: number, y: number, s: string, o: TextOpts = {}) {
    const size = o.size ?? 10;
    const bold = o.bold ?? false;
    const clean = sanitize(s);
    if (!clean) return;
    const w = textWidth(clean, size, bold);
    const left = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
    this.ops.push({ t: 'text', x: left, y, s: clean, size, bold, color: o.color ?? '#111827' });
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; lw?: number } = {}) {
    this.ops.push({ t: 'rect', x, y, w, h, fill: o.fill, stroke: o.stroke, lw: o.lw ?? 0.75 });
  }

  line(x1: number, y1: number, x2: number, y2: number, color = '#e5e7eb', lw = 0.75) {
    this.ops.push({ t: 'line', x1, y1, x2, y2, color, lw });
  }

  toPdf(): Uint8Array {
    const rgb = (hex: string) => {
      const n = parseInt(hex.replace('#', ''), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' ');
    };
    const f = (n: number) => (Math.round(n * 100) / 100).toString();
    const Y = (y: number) => f(this.h - y);
    // Windows-1252 bytes as a string of char codes 0–255; escape PDF string syntax.
    const bytes = (s: string) =>
      [...s].map((c) => (EXTRA[c] ? String.fromCharCode(EXTRA[c][0]) : c)).join('').replace(/[\\()]/g, (m) => `\\${m}`);

    const streams = this.pages.map((ops) =>
      ops
        .map((op) => {
          if (op.t === 'text') return `BT /${op.bold ? 'F2' : 'F1'} ${f(op.size)} Tf ${rgb(op.color)} rg ${f(op.x)} ${Y(op.y)} Td (${bytes(op.s)}) Tj ET`;
          if (op.t === 'line') return `${f(op.lw)} w ${rgb(op.color)} RG ${f(op.x1)} ${Y(op.y1)} m ${f(op.x2)} ${Y(op.y2)} l S`;
          const box = `${f(op.x)} ${Y(op.y + op.h)} ${f(op.w)} ${f(op.h)} re`;
          if (op.fill && op.stroke) return `${rgb(op.fill)} rg ${f(op.lw)} w ${rgb(op.stroke)} RG ${box} B`;
          if (op.fill) return `${rgb(op.fill)} rg ${box} f`;
          return `${f(op.lw)} w ${rgb(op.stroke ?? '#000000')} RG ${box} S`;
        })
        .join('\n'),
    );

    const objects: string[] = [];
    const pageIds = this.pages.map((_, i) => 6 + i * 2);
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objects[5] = `<< /Title (${bytes(sanitize(this.title))}) /Producer (RunTruck) /Creator (RunTruck TMS) >>`;
    streams.forEach((s, i) => {
      objects[6 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.w} ${this.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`;
      objects[7 + i * 2] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`;
    });

    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    for (let i = 1; i < objects.length; i++) {
      offsets[i] = out.length;
      out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const data = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) data[i] = out.charCodeAt(i) & 0xff;
    return data;
  }
}

// Save the document through the browser's download.
export function downloadPdf(doc: PdfDoc, filename: string) {
  const blob = new Blob([doc.toPdf() as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function openPdf(doc: PdfDoc) {
  const blob = new Blob([doc.toPdf() as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
