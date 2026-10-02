import { describe, expect, it } from 'vitest';
import { csvCell, csvText } from './csv';

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Acme, Inc.')).toBe('"Acme, Inc."');
    expect(csvCell('5" pipe')).toBe('"5"" pipe"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('makes text that a spreadsheet would run as a formula harmless', () => {
    expect(csvCell('=HYPERLINK("http://x","Click")')).toBe('"\'=HYPERLINK(""http://x"",""Click"")"');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('+1 (555) 010-2000')).toBe("'+1 (555) 010-2000");
  });

  it('leaves numbers alone, negative ones too', () => {
    expect(csvCell(-12.5)).toBe('-12.5');
    expect(csvCell('-$1,200.00')).toBe('"-$1,200.00"');
    expect(csvCell('-15%')).toBe('-15%');
  });

  it('writes nothing for a missing value', () => {
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(null)).toBe('');
  });
});

describe('csvText', () => {
  it('starts with a byte-order mark and separates rows with CRLF', () => {
    expect(csvText([['a', 'b'], [1, 2]])).toBe('﻿a,b\r\n1,2');
  });
});
