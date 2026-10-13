import type { OrderSize, ScheduleResult, ScheduledOrder } from '../types';
import { calculateTotalProfiles } from './calculator';

/** The computed row of a form order (matched by id — the form may have been
 *  edited since, so positions can't be trusted). */
export function rowForOrder(
  result: ScheduleResult | null,
  orderId: string | undefined,
): ScheduledOrder | undefined {
  if (!result || !orderId) return undefined;
  return result.rows.find((r) => r.order.id === orderId);
}

export interface SizeTiming {
  /** When this size is finished. */
  end: Date;
  /** Production time of one sheet / profile, minutes (unknown → undefined). */
  perItemMin?: number;
}

/** When a form size ends, from its order's computed row. The size is matched
 *  by its stable uid, else by position when the length still agrees — a size
 *  added or changed since the last "Calcola" has no timing. Undefined too once
 *  the size is done. */
export function sizeTiming(
  row: ScheduledOrder | undefined,
  size: Pick<OrderSize, 'uid' | 'length'> | undefined,
  sizeIdx: number,
): SizeTiming | undefined {
  if (!row || !size) return undefined;
  const sizes = row.order.sizes ?? [];
  let j = size.uid ? sizes.findIndex((s) => s?.uid === size.uid) : -1;
  if (j < 0 && sizes[sizeIdx]?.length === size.length) j = sizeIdx;
  if (j < 0 || Number(sizes[j]?.length) !== Number(size.length)) return undefined;

  const sd = row.sizeDetails?.[j];
  if (sd) {
    if (sd.remainingMinutes < 0.5) return undefined;
    return {
      end: sd.end,
      perItemMin: sd.sheets > 0 ? sd.productionMinutes / sd.sheets : undefined,
    };
  }
  // Single size without a breakdown: the order's own span.
  if (row.remainingMinutes < 0.5) return undefined;
  const items = calculateTotalProfiles(row.order);
  return {
    end: row.end,
    perItemMin: items && items > 0 ? row.productionMinutes / items : undefined,
  };
}
