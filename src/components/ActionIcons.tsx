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

export function ResultsIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
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

/** A gear with ▶ (production running) — the company's "Produzione" (its
 *  list, page, publishing to it). */
export function ProductionIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065z" />
      <path d="M10 9v6l5-3z" />
    </svg>
  );
}

/** A calendar with ⏸ — stop the line until a day ("Ferma fino a…"). */
export function HaltIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M10 14v4M14 14v4" />
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

/** Three corner squares — a QR code (the marker's marking). */
export function QrIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM21 14v.01M14 21h.01M17.5 21H21v-3.5" />
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

/** Two arrows round — a saved calc kept in step with production. */
export function SyncIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

/** Minus / plus — a row less / one more. */
export function MinusIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function PlusIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Cross — remove (a pause, a list's entry). */
export function CloseIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Sigma — an order counted by its total length (Σ). */
export function SigmaIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M17 5H7l5.5 7L7 19h10" />
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
/** Sheets stacked on a pallet — lastre per bancale. */
export function PalletIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      {/* three sheets */}
      <g fill="currentColor" stroke="none">
        <rect x="4" y="3" width="16" height="2.5" rx="0.6" />
        <rect x="4" y="7" width="16" height="2.5" rx="0.6" />
        <rect x="4" y="11" width="16" height="2.5" rx="0.6" />
      </g>
      {/* the pallet: deck, legs, base */}
      <path d="M2 15.5h20M2 20.5h20M4 16.5v3M12 16.5v3M20 16.5v3" />
    </svg>
  );
}

// The size groups' split / merge: thin and light (a fine stroke), so they sit
// quietly beside "Calcolo Avanzato" — a line with arrows parting from it, or
// coming together onto a dashed one.

/** Split a group of sizes: arrows parting from a line. */
export function SplitGroupIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} strokeWidth={1.5} className={className}>
      <path d="M4 12h16" />
      <path d="M8 7l4-4 4 4" />
      <path d="M8 17l4 4 4-4" />
    </svg>
  );
}

/** Merge two groups of sizes: arrows coming together onto a dashed line. */
export function MergeGroupIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} strokeWidth={1.5} className={className}>
      <path d="M12 3v6M9 6l3 3 3-3" />
      <path d="M12 21v-6M9 18l3-3 3 3" />
      <path d="M4 12h2M9 12h2M13 12h2M18 12h2" />
    </svg>
  );
}

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

/** A key — the account's password. */
export function KeyIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
    </svg>
  );
}

/** An open eye — show the password. */
export function EyeIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** A crossed-out eye — hide the password. */
export function EyeOffIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
    </svg>
  );
}
