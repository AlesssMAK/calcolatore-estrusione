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

/** Factory — the company's "Produzione" list (published results + report). */
export function FactoryIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M17 18h1M12 18h1M7 18h1" />
    </svg>
  );
}

/** Pause — stop a running process. */
export function PauseIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 5v14M15 5v14" />
    </svg>
  );
}

/** Play — start a paused process again. */
export function PlayIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 4.5v15l12-7.5z" />
    </svg>
  );
}

/** Camera — take a photo. */
export function CameraIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

/** Picture — upload an image. */
export function ImageIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}

/** Trash — clear. */
export function TrashIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

/** Arrow into a tray — import. */
export function ImportIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  );
}

/** Printer — print. */
export function PrintIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

/** Arrow out of a tray — share. */
export function ShareIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
    </svg>
  );
}

/** Gear — settings. */
export function SettingsIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** Door with an arrow out — sign out. */
export function LogoutIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

/** Two sheets — copy. */
export function CopyIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/** Check mark — done / copied. */
export function CheckIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Pencil — edit. */
export function EditIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

/** Stop (rounded square) — "Ferma produzione". */
export function StopIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
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
