// Shared classes for the compact (icon-only) action buttons pinned by
// FloatingActions, and used by the Salvati / Azienda buttons' compact variant.

/** Where a compact action button lives: the pinned bottom bar (phone) or the
 *  pinned vertical rail on the right (sm+). */
export type FloatPlacement = 'bar' | 'rail';

/** Compact icon button: a 40px square, same on the phone bar and the rail.
 *  `relative` anchors the count badge. */
export const floatBtnCls = (primary = false) =>
  `relative flex items-center justify-center rounded-md border shadow-sm transition ${
    primary
      ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700'
      : 'border-neutral-300 bg-white text-ink-soft hover:border-brand-500 hover:text-brand-600'
  } h-10 w-10`;

/** Count badge pinned to the compact button's top-right corner. */
export const floatBadgeCls =
  'absolute -top-1.5 -right-1.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] leading-[1.125rem] font-semibold text-white';

/** Dropdown of a compact button: opens upward across the phone bar (positioned
 *  against the fixed bar — the button wrapper is `display: contents`), or to
 *  the left of the bottom-pinned rail, growing upward from the button. */
export const floatMenuCls = (p: FloatPlacement) =>
  p === 'bar'
    ? 'absolute right-3 bottom-full left-3 z-30 mb-2 max-h-[60vh] overflow-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-lg'
    : 'absolute right-full bottom-0 z-30 mr-2 max-h-[60vh] w-[min(22rem,calc(100vw-5rem))] overflow-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-lg';
