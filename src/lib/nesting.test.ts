import { describe, it, expect } from 'vitest';
import { computeNesting, type SheetInput } from './nesting';

describe('computeNesting — base', () => {
  it('uses the longest sheet as base when none is given', () => {
    const r = computeNesting([{ length: 1000, qty: 2 }]);
    expect(r.base).toBe(1000);
    expect(r.totalSlots).toBe(2);
    expect(r.slots.every((s) => s.scarto === 0)).toBe(true);
  });

  it('honours a manual base larger than the longest sheet', () => {
    const r = computeNesting([{ length: 1000, qty: 1 }], { base: 3000 });
    expect(r.base).toBe(3000);
    expect(r.slots[0].scarto).toBe(2000);
  });

  it('raises a too-small manual base up to the longest sheet', () => {
    const r = computeNesting([{ length: 5000, qty: 1 }], { base: 2000 });
    expect(r.base).toBe(5000);
  });
});

describe('computeNesting — packing', () => {
  it('packs same-length sheets that fit twice into one corsia', () => {
    // base 7275, 3400×2 fit together (6800 ≤ 7275).
    const r = computeNesting([{ length: 3400, qty: 2 }], { base: 7275 });
    expect(r.totalSlots).toBe(1);
    expect(r.slots[0].pieces).toEqual([3400, 3400]);
    expect(r.slots[0].length).toBe(6800);
    expect(r.slots[0].scarto).toBe(475);
  });

  it('combines different lengths to fill a corsia', () => {
    const r = computeNesting(
      [
        { length: 5000, qty: 2 },
        { length: 3000, qty: 2 },
      ],
      { base: 10000 },
    );
    expect(r.totalSlots).toBe(2);
    // Sorted desc: [5000,5000]=10000 then [3000,3000]=6000.
    expect(r.slots.map((s) => s.length)).toEqual([10000, 6000]);
    expect(r.totalScarto).toBe(4000);
  });

  it('keeps a too-long sheet in its own corsia', () => {
    // 7630 already fills most of base 8000, 2760 cannot join it.
    const r = computeNesting(
      [
        { length: 7630, qty: 1 },
        { length: 2760, qty: 1 },
      ],
      { base: 8000 },
    );
    expect(r.totalSlots).toBe(2);
  });
});

describe('computeNesting — real order (500 mm sheet, 68 pcs)', () => {
  const sheets: SheetInput[] = [
    10460, 10230, 6740, 3440, 7630, 2550, 6970, 3200, 4220, 2990, 2760, 9790,
    9560, 8680, 8450, 8300, 8070,
  ].map((length) => ({ length, qty: 4 }));

  it('lands on the hand-verified optimum: 48 corsie, 68 fogli', () => {
    const r = computeNesting(sheets);
    expect(r.base).toBe(10460);
    expect(r.totalSlots).toBe(48);
    expect(r.totalFogli).toBe(68);
    // Minimum scarto = 48 × 10460 − Σ(length×qty) = 502080 − 456160.
    expect(r.totalScarto).toBe(45920);
  });

  it('produces tight combinations that fill the base', () => {
    const r = computeNesting(sheets);
    const combos = r.slots.map((s) => s.pieces.slice().sort((a, b) => b - a));
    // The non-trivial combinations the subset-sum packer finds.
    expect(combos).toContainEqual([6970, 3440]);
    expect(combos).toContainEqual([7630, 2760]);
    expect(combos).toContainEqual([6740, 3200]);
    // The 4220 corsie fill with two equal shorts (2990+2990 / 2550+2550)
    // rather than a single second 4220 — that's what keeps it at 48 corsie.
    expect(combos).toContainEqual([4220, 2990, 2990]);
    expect(combos).toContainEqual([4220, 2550, 2550]);
  });

  it('groups into 24 strati of 2 corsie with lanes=2', () => {
    const r = computeNesting(sheets, { lanes: 2 });
    expect(r.strati).toHaveLength(24);
    expect(r.strati.every((s) => s.corsie.length === 2)).toBe(true);
    expect(r.strati.reduce((sum, s) => sum + s.fogli, 0)).toBe(68);
  });
});

describe('computeNesting — strati & bancali', () => {
  it('leaves a shorter last strato for an odd corsia count', () => {
    const r = computeNesting([{ length: 1000, qty: 3 }], { lanes: 2 });
    expect(r.strati).toHaveLength(2);
    expect(r.strati[0].corsie).toHaveLength(2);
    expect(r.strati[1].corsie).toHaveLength(1);
    expect(r.totalFogli).toBe(3);
  });

  it('splits strati into bancali by maxRows', () => {
    // All lengths > base/2 so none can share a corsia → 5 corsie, lanes 1 →
    // 5 strati, chunked into bancali of 2.
    const r = computeNesting(
      [5000, 4500, 4000, 3500, 3000].map((length) => ({ length, qty: 1 })),
      { base: 5000, lanes: 1, maxRows: 2 },
    );
    expect(r.strati).toHaveLength(5);
    expect(r.bancali.map((b) => b.strati.length)).toEqual([2, 2, 1]);
  });

  it('returns an empty result for no valid input', () => {
    const r = computeNesting([{ length: 0, qty: 5 }, { length: 100, qty: 0 }]);
    expect(r.totalSlots).toBe(0);
    expect(r.totalFogli).toBe(0);
    expect(r.bancali).toHaveLength(0);
  });
});
