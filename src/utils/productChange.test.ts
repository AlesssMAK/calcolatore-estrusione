import { describe, expect, it } from 'vitest';
import { isProductChange, productChangesWithoutPause, sameProduct } from './productChange';

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
