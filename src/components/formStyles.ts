// Calculator form inputs (orders list + pause cards).

// All form inputs share a fixed height: 32px on mobile, 36px on sm+ (matching
// the +/− action buttons). Height controls the size, so no vertical padding.
// A grey hint longer than the field ends in "…"; on a phone it's 11px, as in
// the size fields.
export const inputBase =
  'h-8 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-ellipsis text-ink shadow-sm transition max-sm:placeholder:text-[11px] focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:h-9';

export const labelBase =
  'block text-xs font-medium tracking-wide text-ink-soft uppercase';

// A tracked calc's bare icon buttons (components/BareButton).

/** A tracked calc's icon size (✓ Σ ⏸ 🗑, ▶ ⏹, − +…). */
export const bareIconSize = 'h-4 w-4 sm:h-4.5 sm:w-4.5';

/** Hover / focus colours of a bare icon: grey → red (the app's accent). */
export const bareNeutral =
  'text-ink-soft group-hover/ib:text-brand-700 group-focus-visible/ib:text-brand-700';
/** …a "pressed" one (Σ, ⏸ on). */
export const bareOn =
  'text-brand-600 group-hover/ib:text-brand-800 group-focus-visible/ib:text-brand-800';
/** …an emoji (no colour of its own to change): a touch bigger. */
export const bareEmoji = 'text-sm group-hover/ib:scale-110 sm:text-base';
