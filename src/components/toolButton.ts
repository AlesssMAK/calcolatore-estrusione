// The project's action-button pattern (like "✏ Nome Calcolo" / "+ Aggiungi"
// in the calculator), shared by the Piramide toolbar and the admin pages: one
// size — 32px square icon on phones, 36px with the label on sm+ (the label lives
// in a `hidden sm:inline` span) — and an SVG icon from ActionIcons.

const base =
  'inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:px-3 sm:text-sm';

export const toolBtnCls = (primary = false): string =>
  `${base} ${
    primary
      ? 'border-brand-600 bg-brand-600 font-semibold text-white hover:bg-brand-700'
      : 'border-neutral-300 bg-white text-ink-soft hover:border-brand-500 hover:text-brand-600'
  }`;

/** SVG icon size inside a tool button. */
export const toolIconCls = 'h-4 w-4';
