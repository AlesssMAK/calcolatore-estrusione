// Minimal stroke icons for the compact (floating) action buttons. They inherit
// the text color (currentColor) and size from the className.

type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function CalcIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v3M8 18h.01M12 18h.01" />
    </svg>
  );
}

export function ResetIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function SaveIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}

export function BuildingIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
    </svg>
  );
}

/** Filled chevron (Syllert sprite `arrow_back_ios_new`, rotated to point up). */
export function ChevronUpIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden
      className={`${className} rotate-90`}
    >
      <path d="M12.474 16l10.404 10.404c0.266 0.271 0.4 0.61 0.402 1.016s-0.131 0.756-0.402 1.050c-0.293 0.288-0.643 0.432-1.050 0.432s-0.754-0.144-1.042-0.432l-10.879-10.879c-0.227-0.227-0.391-0.478-0.493-0.754s-0.153-0.555-0.153-0.837 0.051-0.561 0.153-0.837c0.102-0.276 0.266-0.528 0.493-0.754l10.912-10.904c0.288-0.293 0.628-0.436 1.021-0.427s0.738 0.159 1.037 0.452c0.266 0.293 0.404 0.638 0.415 1.033s-0.127 0.74-0.415 1.033l-10.404 10.404z" />
    </svg>
  );
}
