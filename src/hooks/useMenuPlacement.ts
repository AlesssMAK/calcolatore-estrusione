import { useEffect, useState, type CSSProperties, type RefObject } from 'react';

/** Room a menu wants below its anchor before it rather opens above (px). */
const ROOM = 240;
/** Space kept between the menu and the screen edge / its anchor (px). */
const EDGE = 8;

export interface MenuPlace {
  /** Open above the anchor (there's not enough room below). */
  up: boolean;
  /** Height the menu can take without leaving the screen (px). */
  maxHeight: number;
}

/** Bottom of the usable screen: the visible viewport (phone keyboard), above
 *  the pinned action bar when it's shown. */
function screenBottom(): number {
  let bottom = window.visualViewport?.height ?? window.innerHeight;
  const bar = document.querySelector('[data-float-bar]');
  if (bar && bar.getClientRects().length > 0) {
    bottom = Math.min(bottom, bar.getBoundingClientRect().top);
  }
  return bottom;
}

/** Where a menu anchored to `el` fits: below it, or above when there's not
 *  enough room below and more above. `wanted` caps its height. */
export function placeMenu(el: HTMLElement | null, wanted: number): MenuPlace {
  if (!el) return { up: false, maxHeight: wanted };
  const r = el.getBoundingClientRect();
  const below = screenBottom() - r.bottom - EDGE;
  const above = r.top - EDGE;
  const up = below < Math.min(wanted, ROOM) && above > below;
  return { up, maxHeight: Math.max(120, Math.min(wanted, up ? above : below)) };
}

/** A small menu pinned next to `el` (fixed, so a scrolling list around it
 *  can't cut it off): right-aligned to it, below or above as it fits. */
export function fixedMenuStyle(el: HTMLElement, wanted: number): CSSProperties {
  const r = el.getBoundingClientRect();
  const { up, maxHeight } = placeMenu(el, wanted);
  // (fixed offsets are taken from the viewport without its scrollbars)
  const { clientWidth, clientHeight } = document.documentElement;
  return {
    position: 'fixed',
    right: Math.max(EDGE, clientWidth - r.right),
    maxHeight,
    ...(up ? { bottom: clientHeight - r.top + 4 } : { top: r.bottom + 4 }),
  };
}

/**
 * Keep a drop-down on screen, like the menus of the pinned action buttons:
 * below its anchor when there's room, else above it, its height capped to the
 * room it has. `measure()` places it as it opens; while open, scrolling /
 * resizing places it again.
 */
export function useMenuPlacement(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  wanted = 480,
): MenuPlace & { measure: () => void } {
  const [place, setPlace] = useState<MenuPlace>({ up: false, maxHeight: wanted });
  const measure = () => {
    const next = placeMenu(anchor.current, wanted);
    setPlace((p) => (p.up === next.up && p.maxHeight === next.maxHeight ? p : next));
  };
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const next = placeMenu(anchor.current, wanted);
      setPlace((p) => (p.up === next.up && p.maxHeight === next.maxHeight ? p : next));
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [open, anchor, wanted]);
  return { ...place, measure };
}
