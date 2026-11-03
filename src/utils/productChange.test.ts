import { describe, expect, it } from 'vitest';
import {
  isProductChange,
  planRename,
  productChangesWithoutPause,
  sameProduct,
} from './productChange';

const o = (productName: string, gapEnabled = false) => ({ productName, gapEnabled });

describe('productChangesWithoutPause', () => {
  it('flags a different product next to another with no pause', () => {
    expect(productChangesWithoutPause([o('PC 16'), o('PC 16'), o('PC 10')])).toEqual([1]);
  });

  it('a pause between them settles it', () => {
    expect(productChangesWithoutPause([o('PC 16', true), o('PC 10')])).toEqual([]);
  });

  it('ignores case / spaces and orders without a product', () => {
    expect(productChangesWithoutPause([o(' pc 16 '), o('PC 16'), o(''), o('PC 10')])).toEqual([]);
  });

  it('flags every boundary of an order between two others', () => {
    expect(productChangesWithoutPause([o('A'), o('B'), o('C')])).toEqual([0, 1]);
  });

  it('old calcs: the global "with gaps" mode counts as a pause', () => {
    const orders = [{ productName: 'A' }, { productName: 'B' }];
    expect(productChangesWithoutPause(orders, 'withGaps')).toEqual([]);
    expect(productChangesWithoutPause(orders, 'continuous')).toEqual([0]);
  });
});

describe('isProductChange', () => {
  it('different products after order i, pause or not', () => {
    const orders = [o('A', true), o('B'), o('b '), o('')];
    expect([0, 1, 2, 3].map((i) => isProductChange(orders, i))).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('sameProduct', () => {
  it('compares names the way an operator reads them', () => {
    expect(sameProduct('PC 16', ' pc 16')).toBe(true);
    expect(sameProduct('PC 16', 'PC 10')).toBe(false);
    expect(sameProduct(undefined, '')).toBe(true);
  });
});

describe('planRename', () => {
  // [Onda Onda Onda] ⏸ [Compact Compact] ⏸ [Onda]
  const q = () => [
    o('Onda'),
    o('Onda'),
    o('Onda', true),
    o('Compact'),
    o('Compact', true),
    o('Onda'),
  ];

  it("the block's first order asks — with where it would go otherwise", () => {
    expect(planRename(q(), 0, 'Compact')).toEqual({
      kind: 'ask',
      block: 0,
      members: [0, 1, 2],
      join: 4, // the Compact block ends at #5
    });
    expect(planRename(q(), 3, 'Pc 10')).toEqual({
      kind: 'ask',
      block: 1,
      members: [3, 4],
      join: null,
    });
  });

  it('another order leaves: into a block making that product, else its own', () => {
    expect(planRename(q(), 1, ' compact ')).toEqual({ kind: 'join', to: 4 });
    expect(planRename(q(), 4, 'Onda')).toEqual({ kind: 'join', to: 2 }); // the first Onda block
    expect(planRename(q(), 1, 'Pc 10')).toEqual({ kind: 'leave' });
  });

  it('just changes: alone in its block, the same product, no product before, not placed', () => {
    expect(planRename(q(), 5, 'Compact')).toEqual({ kind: 'plain' });
    expect(planRename(q(), 0, 'ONDA')).toEqual({ kind: 'plain' });
    expect(planRename([o(''), o('')], 0, 'Onda')).toEqual({ kind: 'plain' });
    expect(planRename([o('Onda'), { productName: 'Onda', unplaced: true }], 1, 'X')).toEqual({
      kind: 'plain',
    });
  });

  it("an order getting its block's product back just changes", () => {
    expect(planRename([o('Onda'), o('Compact')], 1, 'Onda')).toEqual({ kind: 'plain' });
  });
});
