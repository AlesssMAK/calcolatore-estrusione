import { afterEach, describe, expect, it, vi } from 'vitest';
import { placeMenu } from './useMenuPlacement';

/** An anchor whose right edge is at `right` on the screen. */
function anchorEndingAt(right: number) {
  const el = document.createElement('button');
  el.getBoundingClientRect = () =>
    ({ top: 100, bottom: 140, left: right - 120, right }) as DOMRect;
  return el;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a right-aligned menu near the left of the screen', () => {
  it('moves right, its left edge 8px from the screen edge', () => {
    vi.stubGlobal('innerWidth', 678);
    // 320 wide, ending at 211: it would start at -109.
    expect(placeMenu(anchorEndingAt(211), 480, 320).shift).toBe(117);
  });

  it('stays put when it fits', () => {
    vi.stubGlobal('innerWidth', 1280);
    expect(placeMenu(anchorEndingAt(700), 480, 320).shift).toBe(0);
  });

  it('on a phone is as wide as the screen allows, and needs no move', () => {
    vi.stubGlobal('innerWidth', 320);
    // Full-width button ending at 308; the menu is 296 there, not 320.
    expect(placeMenu(anchorEndingAt(308), 480, 320).shift).toBe(0);
  });

  it('a menu without a width is never moved', () => {
    expect(placeMenu(anchorEndingAt(40), 480).shift).toBe(0);
  });
});
