// Company "Causali di Fermo": named pauses between orders (die change,
// cleaning…), each with a colour and an optional fixed duration. Set in /admin
// (stored in company_settings.pauseReasons), picked in the calculator's pause.

import type { PauseReasonSnapshot } from '../types';

/** 12 distinct colours. No red / pink: the brand red and its pink tint already
 *  mean "in production". */
export const PAUSE_COLORS = [
  { key: 'grey', hex: '#64748b', label: 'Grigio' },
  { key: 'black', hex: '#1f2937', label: 'Nero' },
  { key: 'brown', hex: '#92400e', label: 'Marrone' },
  { key: 'orange', hex: '#ea580c', label: 'Arancione' },
  { key: 'yellow', hex: '#eab308', label: 'Giallo' },
  { key: 'lime', hex: '#84cc16', label: 'Lime' },
  { key: 'green', hex: '#16a34a', label: 'Verde' },
  { key: 'teal', hex: '#0d9488', label: 'Verde Acqua' },
  { key: 'cyan', hex: '#06b6d4', label: 'Ciano' },
  { key: 'blue', hex: '#2563eb', label: 'Blu' },
  { key: 'indigo', hex: '#4f46e5', label: 'Indaco' },
  { key: 'purple', hex: '#9333ea', label: 'Viola' },
] as const;

export type PauseColor = (typeof PAUSE_COLORS)[number]['key'];

export interface PauseReason {
  id: string;
  name: string;
  color: PauseColor;
  /** Fixed duration (minutes) put into the pause — still editable in a calc.
   *  null → "Libera": picked from the slot list, as a plain pause. */
  durationMin: number | null;
}

/** Longest fixed duration an admin can set (24 h). */
export const MAX_PAUSE_REASON_MIN = 1440;

const COLOR_KEYS = new Set<string>(PAUSE_COLORS.map((c) => c.key));

export function pauseColorHex(color: string | undefined): string {
  return PAUSE_COLORS.find((c) => c.key === color)?.hex ?? PAUSE_COLORS[0].hex;
}

/** What an order keeps of a reason picked for its pause (Order.gapReason). */
export function reasonSnapshot(r: PauseReason): PauseReasonSnapshot {
  return { id: r.id, name: r.name, color: r.color, defaultMin: r.durationMin };
}

/** "30 min", "2 h", "2 h 30 min". */
export function fmtPause(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Tolerant parse of the stored list: drops malformed entries, clamps
 *  durations, falls back to grey for an unknown colour. */
export function normalizePauseReasons(raw: unknown): PauseReason[] {
  if (!Array.isArray(raw)) return [];
  const out: PauseReason[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const p = (item ?? {}) as Record<string, unknown>;
    const id = typeof p.id === 'string' ? p.id : '';
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const d = Number(p.durationMin);
    out.push({
      id,
      name,
      color: (COLOR_KEYS.has(p.color as string) ? p.color : 'grey') as PauseColor,
      durationMin:
        p.durationMin != null && Number.isFinite(d) && d > 0
          ? Math.min(MAX_PAUSE_REASON_MIN, Math.round(d))
          : null,
    });
  }
  return out;
}
