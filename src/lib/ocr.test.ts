import { describe, it, expect } from 'vitest';
import { parseOcrText, detectSkewAngle } from './ocr';

// Synthetic "text lines" tilted by `tiltDeg` (positive = clockwise).
function tiltedGray(w: number, h: number, tiltDeg: number): Uint8ClampedArray {
  const g = new Uint8ClampedArray(w * h).fill(255);
  const t = Math.tan((tiltDeg * Math.PI) / 180);
  for (let lineY = 30; lineY < h - 30; lineY += 50) {
    for (let x = 20; x < w - 20; x++) {
      if (x % 6 >= 4) continue; // dashes → text-like
      const base = Math.round(lineY + x * t);
      for (let dy = 0; dy < 8; dy++) {
        const yy = base + dy;
        if (yy >= 0 && yy < h) g[yy * w + x] = 0;
      }
    }
  }
  return g;
}

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

  it('keeps a plausible long length (≤ 11000) intact', () => {
    expect(parseOcrText('10460')).toEqual([{ length: 10460, qty: 1 }]);
  });

  it('un-glues the 11000–13000 window by default (11270 = 1 + 1270)', () => {
    // Small qty-1 orders whose gap collapsed land here; the strict 11000 cap
    // splits them instead of accepting a phantom 11–13 m sheet.
    expect(parseOcrText('11270')).toEqual([{ length: 1270, qty: 1 }]);
    expect(parseOcrText('13000')).toEqual([{ length: 3000, qty: 1 }]);
  });

  it('honors a raised maxLen so rare extra-long sheets stay intact', () => {
    // Operator opts into reading real 11–13.5 m sheets by raising the cap.
    expect(parseOcrText('13000', { maxLen: 13500 })).toEqual([
      { length: 13000, qty: 1 },
    ]);
    expect(parseOcrText('11270', { maxLen: 13500 })).toEqual([
      { length: 11270, qty: 1 },
    ]);
  });

  it('honors a raised minLen so short values below the floor are dropped', () => {
    // Default reads 800 as a length; with minLen 1000 it falls below the floor.
    expect(parseOcrText('4 800')).toEqual([{ length: 800, qty: 4 }]);
    expect(parseOcrText('4 800', { minLen: 1000 })).toEqual([]);
    // A real length above the raised floor still reads fine.
    expect(parseOcrText('4 1500', { minLen: 1000 })).toEqual([
      { length: 1500, qty: 4 },
    ]);
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

describe('detectSkewAngle', () => {
  it('finds the straightening angle of clockwise-tilted text', () => {
    // Text tilted +6° (CW) → straighten by ≈ -6°.
    const angle = detectSkewAngle(tiltedGray(480, 360, 6), 480, 360);
    expect(angle).toBeGreaterThanOrEqual(-7.5);
    expect(angle).toBeLessThanOrEqual(-4.5);
  });

  it('finds the straightening angle of counter-clockwise-tilted text', () => {
    const angle = detectSkewAngle(tiltedGray(480, 360, -6), 480, 360);
    expect(angle).toBeGreaterThanOrEqual(4.5);
    expect(angle).toBeLessThanOrEqual(7.5);
  });

  it('returns ~0 for straight text', () => {
    expect(
      Math.abs(detectSkewAngle(tiltedGray(480, 360, 0), 480, 360)),
    ).toBeLessThanOrEqual(1);
  });
});
