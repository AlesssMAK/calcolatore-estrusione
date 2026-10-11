import { describe, expect, it } from 'vitest';
import { applyPiramideToOrder, revertPiramide } from './piramideApply';
import type { Order } from '../types';

// An order in production: 3000 mm has 40 of 100 made, 2000 mm 10 of 50.
const order: Order = {
  id: 'o1',
  speedMPerMin: 3,
  sizes: [
    { sheets: 100, length: 3000, uid: 'a' },
    { sheets: 50, length: 2000, uid: 'b' },
    { sheets: 20, length: 1500, uid: 'c' },
  ],
  producedSheets: [
    { sizeIndex: 0, value: 40 },
    { sizeIndex: 1, value: 10 },
  ],
  sheetsPerPallet: [{ sizeIndex: 0, value: 20 }, { sizeIndex: 1 }],
  producedPallets: [{ sizeIndex: 0 }, { sizeIndex: 1 }],
};

// Piramide's production order: 2000 first, then 3000; 1500 left out.
const rows = [
  { length: 2000, qty: 50 },
  { length: 3000, qty: 100 },
];
const schema = { bancali: [{ strati: [] }] };

describe('applyPiramideToOrder', () => {
  const applied = applyPiramideToOrder(order, rows, schema);

  it('takes the layout rows as sizes, in production order', () => {
    expect(applied.sizes?.map((s) => [s.length, s.sheets])).toEqual([
      [2000, 50],
      [3000, 100],
    ]);
    expect(applied.piramideSchema).toBe(schema);
    expect(applied.useTotalLength).toBe(false);
  });

  it('keeps what was produced with its length, and the size uids', () => {
    const produced = applied.producedSheets!.map((e) => [e.sizeIndex, e.value]);
    expect(produced).toContainEqual([1, 40]); // 3000 moved to index 1
    expect(produced).toContainEqual([0, 10]); // 2000 moved to index 0
    expect(applied.sheetsPerPallet).toContainEqual({ sizeIndex: 1, value: 20 });
    expect(applied.sizes?.map((s) => s.uid)).toEqual(['b', 'a']);
  });

  it('remembers the sizes from before — once, across recomputes', () => {
    expect(applied.piramideOriginal?.sizes).toBe(order.sizes);
    const again = applyPiramideToOrder(applied, [{ length: 3000, qty: 100 }], schema);
    expect(again.piramideOriginal?.sizes).toBe(order.sizes);
  });
});

describe('revertPiramide', () => {
  it('restores the original sizes and drops the layout', () => {
    const back = revertPiramide(applyPiramideToOrder(order, rows, schema));
    expect(back.sizes).toEqual(order.sizes);
    expect(back.piramideSchema).toBeUndefined();
    expect(back.piramideOriginal).toBeUndefined();
  });

  it('keeps production made in the meantime, by length', () => {
    const applied = applyPiramideToOrder(order, rows, schema);
    // 3000 (now index 1) went from 40 to 60 while on the Piramide sizes.
    const progressed: Order = {
      ...applied,
      producedSheets: [
        { sizeIndex: 0, value: 10 },
        { sizeIndex: 1, value: 60 },
      ],
    };
    const back = revertPiramide(progressed);
    const produced = back.producedSheets!.map((e) => [e.sizeIndex, e.value]);
    expect(produced).toContainEqual([0, 60]);
    expect(produced).toContainEqual([1, 10]);
  });

  it('leaves an order without a Piramide round-trip as it is', () => {
    expect(revertPiramide(order)).toBe(order);
  });
});
