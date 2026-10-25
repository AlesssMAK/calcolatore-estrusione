import type { ScheduledOrder } from '../types';

/** A pause between blocks running at some moment. */
export interface RunningPause {
  /** The reason's name (none → a plain pause). */
  name?: string;
  /** Its PAUSE_COLORS key. */
  color?: string;
  /** When it ends. */
  until: Date;
}

/**
 * The pause running at `at` among a calc's rows — pass the completed ones too:
 * once the block before a pause is done, its closing order has left the active
 * rows. Results computed before pauses carried their times have none.
 */
export function pauseAt(rows: ScheduledOrder[], at: Date): RunningPause | null {
  const t = at.getTime();
  for (const r of rows) {
    if (!(r.gapAfterMin > 0) || !r.gapStart || !r.gapEnd) continue;
    if (r.gapStart.getTime() <= t && t < r.gapEnd.getTime()) {
      return {
        name: r.order.gapReason?.name,
        color: r.order.gapReason?.color,
        until: r.gapEnd,
      };
    }
  }
  return null;
}
