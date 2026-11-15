import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

/**
 * A button that's just its icon, no box round it — hover, focus and press
 * show on the icon itself (a tracked calc's form, the pop-up lists).
 * `iconCls`: its colours (hover too).
 */
export default function BareButton({
  title,
  onClick,
  disabled,
  pressed,
  iconCls,
  className = '',
  children,
}: {
  title: string;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  pressed?: boolean;
  iconCls: string;
  className?: string;
  /** The icon: an SVG (sized by bareIconSize) or a glyph. */
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      aria-label={title}
      className={`group/ib flex h-7 w-6 shrink-0 items-center justify-center focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-7 ${className}`}
    >
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-sm leading-none transition group-focus-visible/ib:ring-2 group-focus-visible/ib:ring-brand-300 group-active/ib:scale-90 group-disabled/ib:scale-100 ${iconCls}`}
      >
        {children}
      </span>
    </button>
  );
}
