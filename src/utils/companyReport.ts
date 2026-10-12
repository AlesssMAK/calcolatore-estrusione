import type { SharedPayload } from '../lib/sharedCalc';
import type { ScheduleSnapshot } from '../types';
import { isWorkingAt, progressAsOf } from './calculator';

/** Where a published calc stands at a given moment:
 *  - running — a size is being produced
 *  - stopped — mid-size, but the line is off (outside working hours)
 *  - waiting — between two steps (pause after an order)
 *  - notStarted — before its first step
 *  - done — everything produced */
export type StageStatus = 'running' | 'stopped' | 'waiting' | 'notStarted' | 'done';

export interface ReportStage {
  status: StageStatus;
  /** The order at that moment (the current one, or the next to start) — its
   *  form number, product name and end. Absent when done. */
  orderNo?: number;
  productName?: string;
  orderEnd?: Date;
  /** The size (mm) being / next produced — absent for a total-meters order. */
  sizeLength?: number;
  /** Produced so far of that size (pieces) — or meters for a total-meters order. */
  produced?: number;
  total?: number;
  unit: 'pieces' | 'meters';
  /** When this step starts (useful while not started / waiting). */
  stepStart?: Date;
  /** End of the whole queue. */
  calcEnd: Date;
}

/** The schedule a published calc was computed on (what its times follow). */
export function payloadSnapshot(p: SharedPayload): ScheduleSnapshot {
  const s = p.values?.settings;
  return (
    p.snapshot ?? {
      weekend: s?.weekend,
      schedule: null,
      warmupMinutes: s?.warmupMinutes ?? 0,
      shutdownMinutes: s?.shutdownMinutes ?? 0,
      noLimits: !!s?.noLimits,
    }
  );
}

interface Step {
  orderIdx: number;
  sizeIdx: number;
  start: Date;
  end: Date;
}

/** Each size of each order as its own [start, end) span, in time order. */
function stepsOf(p: SharedPayload): Step[] {
  const steps: Step[] = [];
  p.result.rows.forEach((row, orderIdx) => {
    const sizes = row.sizeDetails;
    if (sizes && sizes.length > 0) {
      sizes.forEach((sd, sizeIdx) => {
        if (sd.end.getTime() > sd.start.getTime()) {
          steps.push({ orderIdx, sizeIdx, start: sd.start, end: sd.end });
        }
      });
    } else if (row.end.getTime() > row.start.getTime()) {
      steps.push({ orderIdx, sizeIdx: 0, start: row.start, end: row.end });
    }
  });
  return steps.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Where a published (tracked) calc stands at `at`, following its published
 *  schedule: which order + size is on the line and how much of it is done. */
export function stageAt(p: SharedPayload, at: Date): ReportStage {
  const { result } = p;
  const unitOf = (orderIdx: number): ReportStage['unit'] =>
    result.rows[orderIdx]?.order.useTotalLength ? 'meters' : 'pieces';
  const t = at.getTime();
  const steps = stepsOf(p);
  if (steps.length === 0 || t >= result.endAt.getTime()) {
    return { status: 'done', unit: 'pieces', calcEnd: result.endAt };
  }
  const snapshot = payloadSnapshot(p);
  const current = steps.find(
    (s) => s.start.getTime() <= t && t < s.end.getTime(),
  );
  const step = current ?? steps.find((s) => s.start.getTime() > t) ?? null;
  if (!step) return { status: 'done', unit: 'pieces', calcEnd: result.endAt };

  const status: StageStatus = current
    ? isWorkingAt(at, snapshot)
      ? 'running'
      : 'stopped'
    : t < steps[0].start.getTime()
      ? 'notStarted'
      : 'waiting';

  const row = result.rows[step.orderIdx];
  const progress = progressAsOf(result, at, snapshot).orders[step.orderIdx];
  let produced: number | undefined;
  let total: number | undefined;
  let sizeLength: number | undefined;
  if (row.order.useTotalLength) {
    produced = Math.round(progress?.producedLengthM ?? 0);
    total = Math.round(row.totalLengthM);
  } else {
    const sd = row.sizeDetails?.[step.sizeIdx];
    const os = row.order.sizes?.[step.sizeIdx];
    sizeLength = sd?.length ?? os?.length;
    total = sd?.sheets ?? os?.sheets;
    produced = progress?.producedCountPerSize?.[step.sizeIdx] ?? 0;
  }
  return {
    status,
    orderNo: step.orderIdx + 1,
    productName: row.order.productName?.trim() || undefined,
    orderEnd: row.end,
    sizeLength,
    produced,
    total,
    unit: unitOf(step.orderIdx),
    stepStart: step.start,
    calcEnd: result.endAt,
  };
}
