import { describe, it, expect } from 'vitest';
import { parseOcrText } from './ocr';

describe('parseOcrText', () => {
  it('reads qty + length from a full form line, ignoring decimals', () => {
    // Quantità · Lunghezza · Peso · mq
    const rows = parseOcrText('4 10460 52,30 20,92');
    expect(rows).toEqual([{ length: 10460, qty: 4 }]);
  });

  it('parses a multi-line block', () => {
    const text = ['4 10460 52,30 20,92', '4 3440 17,20 6,88', '4 2550 12,75 5,10'].join(
      '\n',
    );
    expect(parseOcrText(text)).toEqual([
      { length: 10460, qty: 4 },
      { length: 3440, qty: 4 },
      { length: 2550, qty: 4 },
    ]);
  });

  it('skips header and totals rows', () => {
    const text = [
      'Quantità Lunghezza Peso Quantità',
      'n°/pz mm kg mq',
      '4 7630 38,15 15,26',
      '68 456 ml 570,20 228,08',
    ].join('\n');
    expect(parseOcrText(text)).toEqual([{ length: 7630, qty: 4 }]);
  });

  it('defaults qty to 1 when only a length is present', () => {
    expect(parseOcrText('6970')).toEqual([{ length: 6970, qty: 1 }]);
  });

  it('returns nothing for lines without a plausible length', () => {
    expect(parseOcrText('hello world 12')).toEqual([]);
  });

  it('recovers a glued qty+length (collapsed column gap)', () => {
    // Real Tesseract output where the "4" ran into the length.
    expect(parseOcrText('410230')).toEqual([{ length: 10230, qty: 4 }]);
    expect(parseOcrText('46740')).toEqual([{ length: 6740, qty: 4 }]);
    expect(parseOcrText('49560')).toEqual([{ length: 9560, qty: 4 }]);
  });

  it('recovers a two-digit glued quantity', () => {
    expect(parseOcrText('1210460')).toEqual([{ length: 10460, qty: 12 }]);
  });

  it('un-glues 5-digit tokens above the real length range (25095 = 2 + 5095)', () => {
    // OCR often drops the column gap: "2 5095" becomes "25095". 25095 mm is
    // not a real sheet, so it must split — the previous 30000 cap accepted it.
    expect(parseOcrText('25095')).toEqual([{ length: 5095, qty: 2 }]);
    expect(parseOcrText('27005')).toEqual([{ length: 7005, qty: 2 }]);
    expect(parseOcrText('155985')).toEqual([{ length: 5985, qty: 15 }]);
  });

  it('keeps a plausible long length (≤ 13000) intact', () => {
    expect(parseOcrText('10460')).toEqual([{ length: 10460, qty: 1 }]);
  });

  it('parses the exact raw block from the scanned order (all 17 rows)', () => {
    const raw = [
      '4      10460',
      '410230', // glued
      '46740', // glued
      '4      3440',
      '4      7630',
      '4      2550',
      '4      6970',
      '4      3200',
      '4      4220',
      '4      2990',
      '4      2760',
      '4      9790',
      '4      9560',
      '4      8680',
      '4      8450',
      '4      8300',
      '4      8070',
    ].join('\n');
    const rows = parseOcrText(raw);
    expect(rows).toHaveLength(17);
    expect(rows.map((r) => r.length).sort((a, b) => b - a)).toEqual([
      10460, 10230, 9790, 9560, 8680, 8450, 8300, 8070, 7630, 6970, 6740, 4220,
      3440, 3200, 2990, 2760, 2550,
    ]);
    expect(rows.every((r) => r.qty === 4)).toBe(true);
  });

  it('does not split a normal length that also has a separate qty', () => {
    expect(parseOcrText('4 10460 52,30 20,92')).toEqual([
      { length: 10460, qty: 4 },
    ]);
  });
});
