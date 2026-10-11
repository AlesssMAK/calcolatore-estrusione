import { describe, it, expect } from 'vitest';
import { insertMap, moveMap, remapSizeGroup, removeMap } from './sizeEntries';

// Sheets group of an order with sizes A(0), B(1), C(2): one produced row each,
// B has 50 produced and 20 sheets per pallet.
const group = () => [
  [
    { sizeIndex: 0, value: undefined },
    { sizeIndex: 1, value: 50 },
    { sizeIndex: 2, value: undefined },
  ],
  [
    { sizeIndex: 0, value: undefined },
    { sizeIndex: 1, value: 20 },
    { sizeIndex: 2, value: undefined },
  ],
  [
    { sizeIndex: 0, value: undefined },
    { sizeIndex: 1, value: undefined },
    { sizeIndex: 2, value: undefined },
  ],
];
const of = (rows: { sizeIndex?: number; value?: number }[]) =>
  rows.map((e) => `${e.sizeIndex}:${e.value ?? '-'}`);

describe('remapSizeGroup — rows follow their size', () => {
  it('insert after the first size: B\'s data moves with B (index 2), not to the new size', () => {
    const [count, rate] = remapSizeGroup(group(), insertMap(1));
    expect(of(count)).toEqual(['0:-', '2:50', '3:-']);
    expect(of(rate)).toEqual(['0:-', '2:20', '3:-']);
  });

  it('remove B drops its rows from every parallel array', () => {
    const [count, rate, total] = remapSizeGroup(group(), removeMap(1));
    expect(of(count)).toEqual(['0:-', '1:-']);
    expect(of(rate)).toEqual(['0:-', '1:-']);
    expect(total).toHaveLength(2);
  });

  it('move B to the top', () => {
    const [count] = remapSizeGroup(group(), moveMap(1, 0));
    expect(of(count)).toEqual(['1:-', '0:50', '2:-']);
  });

  it('untagged rows use their position; holes are filled so arrays stay aligned', () => {
    const [count, rate] = remapSizeGroup(
      [[{ value: 1 }, { value: 2 }], [undefined, { value: 9 }]],
      insertMap(0),
    );
    expect(of(count)).toEqual(['1:1', '2:2']);
    expect(of(rate)).toEqual(['1:-', '2:9']);
  });
});
