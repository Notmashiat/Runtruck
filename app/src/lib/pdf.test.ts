import { describe, expect, it } from 'vitest';
import { opensInTab } from './attachments';
import { PdfDoc, fit, sanitize, textWidth } from './pdf';

describe('sanitize', () => {
  it('keeps Western European letters', () => {
    expect(sanitize('Transportes Peña e Hijos, Montréal')).toBe('Transportes Peña e Hijos, Montréal');
    expect(sanitize('Müller Spedition')).toBe('Müller Spedition');
  });

  it('prints other accented letters without the accent, not as a question mark', () => {
    // Š and ź lose the accent; Ł has no plain form in the fonts.
    expect(sanitize('Škoda Łódź')).toBe('Skoda ?ódz');
    expect(sanitize('Dvořák')).toBe('Dvorák');
  });

  it('replaces what the fonts cannot print', () => {
    expect(sanitize('A → B')).toBe('A to B');
    expect(sanitize('tab\there')).toBe('tab here');
    expect(sanitize('🚚')).toBe('?');
  });
});

describe('textWidth', () => {
  it('measures an accented letter like the letter under the accent', () => {
    expect(textWidth('é', 10)).toBe(textWidth('e', 10));
    expect(textWidth('Ü', 10)).toBe(textWidth('U', 10));
  });
});

describe('fit', () => {
  it('leaves text that fits alone', () => {
    expect(fit('Short', 200, 10)).toBe('Short');
  });

  it('shortens long text to the width, ending in an ellipsis', () => {
    const long = 'A very long note about a delivery that would not fit in the column '.repeat(40);
    const out = fit(long, 120, 8);
    expect(out.endsWith('…')).toBe(true);
    expect(textWidth(out, 8)).toBeLessThanOrEqual(120);
    // One more character would not have fitted.
    expect(textWidth(`${long.slice(0, out.length)}…`, 8)).toBeGreaterThan(120);
  });
});

describe('PdfDoc', () => {
  it('writes a file that starts and ends like a PDF', () => {
    const doc = new PdfDoc('Test');
    doc.text(40, 60, 'Peña — $1,200.00');
    const text = new TextDecoder('latin1').decode(doc.toPdf());
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('Pe\xf1a');
  });
});

describe('opensInTab', () => {
  it('shows PDFs and pictures in the browser', () => {
    expect(opensInTab({ type: 'application/pdf' })).toBe(true);
    expect(opensInTab({ type: 'image/PNG' })).toBe(true);
  });

  it('never shows a file that could carry a script', () => {
    expect(opensInTab({ type: 'text/html' })).toBe(false);
    expect(opensInTab({ type: 'image/svg+xml' })).toBe(false);
    expect(opensInTab({ type: '' })).toBe(false);
  });
});
