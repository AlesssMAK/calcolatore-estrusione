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
});
