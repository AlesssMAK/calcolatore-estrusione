import { calculateSchedule } from './calculator';
import type { FormValues } from '../formSchema';
import type { CalculatorMode, ScheduleResult } from '../types';

/**
 * Best-effort schedule of the form as it is right now — read by the custom
 * queue UI (banner / editor / ⏭) for which sizes are done or in production.
 * Times ignore the company schedule (only done / started state is used). Null
 * while the form can't be computed yet (no orders, missing speed…).
 */
export function liveSchedule(
  values: FormValues | undefined,
  mode: CalculatorMode,
): ScheduleResult | null {
  if (!values?.settings || !values.orders?.length) return null;
  try {
    return calculateSchedule(values.settings, values.orders, { mode });
  } catch {
    return null;
  }
}
