import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useCatalog } from '../contexts/CatalogContext';
import { nextClosing } from '../utils/calculator';
import { loadWeekendPref } from '../utils/defaults';

export type ReportMode = 'current' | 'closing' | 'at';

/** "HH:MM" of a slot (minutes from midnight). */
export const slotLabel = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface ReportMoment {
  mode: ReportMode;
  setMode: (m: ReportMode) => void;
  day: string;
  setDay: (d: string) => void;
  /** Minutes from midnight, in 30-minute steps. */
  slot: number;
  setSlot: (m: number) => void;
  /** The line's next closing; null on a 24/7 line. */
  closing: Date | null;
  /** The moment looked at (NaN: none — a 24/7 line has no closing). */
  atMs: number;
}

/** The moment a report looks at: now ("In Corso"), the line's next closing,
 *  or a chosen day + time (today, at the next half hour, to start with). */
export function useReportMoment(now: Date): ReportMoment {
  const { settings } = useCatalog();
  const [mode, setMode] = useState<ReportMode>('current');
  const [day, setDay] = useState(() => format(now, 'yyyy-MM-dd'));
  const [slot, setSlot] = useState(
    () => Math.min(47, Math.floor((now.getHours() * 60 + now.getMinutes()) / 30) + 1) * 30,
  );

  // On the company schedule (+ this device's weekend shift, as the calculator
  // uses).
  const closing = useMemo(
    () =>
      nextClosing(now, {
        weekend: loadWeekendPref(),
        schedule: settings.schedule,
      }),
    [now, settings.schedule],
  );

  const atMs =
    mode === 'current'
      ? now.getTime()
      : mode === 'closing'
        ? (closing?.getTime() ?? NaN)
        : new Date(`${day}T${slotLabel(slot)}`).getTime();

  return { mode, setMode, day, setDay, slot, setSlot, closing, atMs };
}
