import { describe, expect, it } from 'vitest';
import { afterMove, groupOf, groupRuns, mergeAfter, splitAfter } from './sizeGroups';

describe('sizeGroups', () => {
  it('reads a size without a group as group 0', () => {
    expect(groupOf(undefined)).toBe(0);
    expect(groupOf({})).toBe(0);
    expect(groupOf({ group: 2 })).toBe(2);
  });

  it('splits a group below a size', () => {
    expect(splitAfter([0, 0, 0, 0], 1)).toEqual([0, 0, 1, 1]);
    // only the rest of that group moves: the next one stays
    expect(splitAfter([0, 0, 1, 1], 0)).toEqual([0, 2, 1, 1]);
  });

  it('merges the group below into the one above', () => {
    expect(mergeAfter([0, 0, 1, 1], 1)).toEqual([0, 0, 0, 0]);
    expect(mergeAfter([0, 1, 1, 2], 0)).toEqual([0, 0, 0, 2]);
  });

  it('puts a moved size in the group it lands in', () => {
    // [a0 b0 | c1 d1]: a → after c
    expect(afterMove([0, 0, 1, 1], 0, 2)).toEqual([0, 1, 1, 1]);
    // d → first: joins the group below it (a's)
    expect(afterMove([0, 0, 1, 1], 3, 0)).toEqual([0, 0, 0, 1]);
    // within one group nothing changes
    expect(afterMove([0, 0, 0], 2, 0)).toEqual([0, 0, 0]);
  });

  it('frames the runs in the order shown', () => {
    expect(groupRuns([0, 1, 2, 3], [0, 0, 1, 1])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    // the same number apart: two frames
    expect(groupRuns([0, 1, 2], [0, 1, 0])).toEqual([[0], [1], [2]]);
    expect(groupRuns([2, 0, 1], [0, 0, 0])).toEqual([[2, 0, 1]]);
  });
});
