import { createContext, useContext } from 'react';
import type { ScheduleResult } from '../types';

/** The computed result of the calc on screen while it's tracked (opened from
 *  Salvati / Produzione) — lets the form show when each size and order ends.
 *  Null for a fresh calc. */
export const TrackedResultContext = createContext<ScheduleResult | null>(null);

export const useTrackedResult = (): ScheduleResult | null =>
  useContext(TrackedResultContext);
