import { describe, it, expect } from 'vitest';
import { buildFormSchema } from './formSchema';

// A minimal valid sizes-mode form: one order, speed set, four sizes filled.
// The produced arrays are what the per-size advanced blocks seed — they are
// PARALLEL (indexed by position) and can go out of sync with producedSheets.
function baseOrder() {
  return {
    id: 'o1',
    speedMPerMin: 10,
    sizes: [
      { sheets: 30, length: 10000 },
      { sheets: 50, length: 9000 },
      { sheets: 50, length: 8000 },
      { sheets: 150, length: 6000 },
    ],
    producedSheets: [
      { sizeIndex: 0, value: 30 },
      { sizeIndex: 1, value: 50 },
      { sizeIndex: 2, value: 18 },
    ],
  };
}

const settings = { startMode: 'now' as const, gapMode: 'continuous' as const };

describe('buildFormSchema — parallel produced arrays with holes', () => {
  // Regression: opening a company/saved calc with some sizes collapsed only
  // mounts the visible sizes' advanced blocks. The active block registers rate
  // rows at its own position, leaving undefined holes earlier in the parallel
  // arrays. Those must not fail validation ("expected object, received
  // undefined") and block a recompute until every tab is expanded.
  it('accepts sparse holes in sheetsPerPallet / producedPallets', () => {
    // Sparse array: indices 0,1 are holes, only index 2 is set — exactly what
    // RHF's register(`...sheetsPerPallet.2`) produces on an otherwise empty arr.
    const sheetsPerPallet: unknown[] = [];
    sheetsPerPallet[2] = { value: undefined, sizeIndex: 2 };
    const producedPallets: unknown[] = [];
    producedPallets[2] = { value: undefined, sizeIndex: 2 };

    const res = buildFormSchema('sheets').safeParse({
      settings,
      orders: [{ ...baseOrder(), sheetsPerPallet, producedPallets }],
    });
    expect(res.success).toBe(true);
    // Holes are normalised to plain entries so nothing downstream sees `undefined`.
    const parsed = res.success ? res.data.orders[0]! : null;
    expect(parsed?.sheetsPerPallet?.every((e) => e != null)).toBe(true);
    expect(parsed?.producedPallets?.every((e) => e != null)).toBe(true);
  });

  it('accepts explicit undefined entries in the parallel arrays', () => {
    const res = buildFormSchema('sheets').safeParse({
      settings,
      orders: [
        {
          ...baseOrder(),
          sheetsPerPallet: [undefined, undefined, { value: 50, sizeIndex: 2 }],
          producedPallets: [undefined, undefined, { value: 1, sizeIndex: 2 }],
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it('still rejects a genuinely incomplete order (missing size length)', () => {
    const res = buildFormSchema('sheets').safeParse({
      settings,
      orders: [
        {
          id: 'o1',
          speedMPerMin: 10,
          sizes: [{ sheets: 30 }], // no length
        },
      ],
    });
    expect(res.success).toBe(false);
  });
});
