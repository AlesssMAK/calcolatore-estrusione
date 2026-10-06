import type { Order, QueueItem, ScheduleResult } from '../types';

/** A step of the production sequence, by position: one size of an order, or the
 *  whole order (`sizeIdx` null — total-meters / single-size orders, which have
 *  no per-size schedule). */
export interface SeqStep {
  orderIdx: number;
  sizeIdx: number | null;
}

/** An order is scheduled size by size when it has 2+ sizes (not total-meters). */
export const isPerSize = (o: Order): boolean =>
  !o.useTotalLength && (o.sizes?.length ?? 0) > 1;

const sameStep = (a: SeqStep | undefined, b: SeqStep | undefined): boolean =>
  !!a && !!b && a.orderIdx === b.orderIdx && a.sizeIdx === b.sizeIdx;

/** The form order: orders one after another, sizes in sequence within each. */
export function naturalSequence(orders: Order[]): SeqStep[] {
  return orders.flatMap<SeqStep>((o, orderIdx) =>
    isPerSize(o)
      ? (o.sizes ?? []).map((_, sizeIdx) => ({ orderIdx, sizeIdx }))
      : [{ orderIdx, sizeIdx: null }],
  );
}

/**
 * Resolve a stored queue (stable ids) to positions in `orders`. Unknown or
 * duplicate entries are dropped. Steps it doesn't mention (sizes / orders added
 * after it was arranged) join right after the last queued step of the same
 * order, or at the end in form order. No queue → the form order.
 */
export function resolveSequence(
  queue: QueueItem[] | undefined,
  orders: Order[],
): SeqStep[] {
  const natural = naturalSequence(orders);
  if (!queue?.length) return natural;
  const key = (s: SeqStep) => `${s.orderIdx}:${s.sizeIdx ?? '*'}`;
  const seq: SeqStep[] = [];
  const seen = new Set<string>();
  for (const q of queue) {
    const orderIdx = orders.findIndex((o) => o.id === q.orderId);
    if (orderIdx < 0) continue;
    const order = orders[orderIdx];
    let step: SeqStep;
    if (isPerSize(order)) {
      const sizeIdx = (order.sizes ?? []).findIndex(
        (s) => !!q.sizeUid && s?.uid === q.sizeUid,
      );
      if (sizeIdx < 0) continue;
      step = { orderIdx, sizeIdx };
    } else {
      step = { orderIdx, sizeIdx: null };
    }
    if (seen.has(key(step))) continue;
    seen.add(key(step));
    seq.push(step);
  }
  for (const n of natural) {
    if (seen.has(key(n))) continue;
    let at = -1;
    for (let i = seq.length - 1; i >= 0; i--) {
      if (seq[i].orderIdx === n.orderIdx) {
        at = i;
        break;
      }
    }
    if (at >= 0) seq.splice(at + 1, 0, n);
    else seq.push(n);
    seen.add(key(n));
  }
  return seq;
}

/** True when the sequence differs from the form order. */
export const differsFromNatural = (seq: SeqStep[], orders: Order[]): boolean => {
  const natural = naturalSequence(orders);
  return seq.some((s, i) => !sameStep(s, natural[i]));
};

/** Back to stable ids (sizes must carry a `uid` — see ensureSizeUids). */
export function toQueue(seq: SeqStep[], orders: Order[]): QueueItem[] {
  return seq.map((s) => {
    const order = orders[s.orderIdx];
    return s.sizeIdx === null
      ? { orderId: order.id }
      : { orderId: order.id, sizeUid: order.sizes?.[s.sizeIdx]?.uid };
  });
}

/** Production minutes still to run for a step in a computed result (whose rows
 *  map 1:1 to `orders`). */
export function stepRemaining(result: ScheduleResult, s: SeqStep): number {
  const row = result.rows[s.orderIdx];
  if (!row) return 0;
  if (s.sizeIdx === null) return row.remainingMinutes;
  return row.sizeDetails?.[s.sizeIdx]?.remainingMinutes ?? 0;
}

/** A step with work defined that's fully produced. */
export function stepDone(result: ScheduleResult, s: SeqStep): boolean {
  const row = result.rows[s.orderIdx];
  const sd = s.sizeIdx === null ? row : row?.sizeDetails?.[s.sizeIdx];
  return !!sd && sd.productionMinutes > 0 && sd.remainingMinutes < 0.5;
}

/** Display bits of a step: order number (1-based, form order), its product
 *  name, and the size ("6000 mm × 50", or "600 m" for total-meters). */
export function stepInfo(
  orders: Order[],
  s: SeqStep,
): { orderNo: number; name?: string; size: string } {
  const order = orders[s.orderIdx];
  const name = order?.productName?.trim() || undefined;
  if (!order || order.useTotalLength) {
    return {
      orderNo: s.orderIdx + 1,
      name,
      size: `${order?.totalLengthM ?? '—'} m`,
    };
  }
  const size = order.sizes?.[s.sizeIdx ?? 0];
  return {
    orderNo: s.orderIdx + 1,
    name,
    size: `${size?.length ?? '—'} mm × ${size?.sheets ?? '—'}`,
  };
}

/** A step already partly produced (it's the one in production). */
export function stepStarted(result: ScheduleResult, s: SeqStep): boolean {
  const row = result.rows[s.orderIdx];
  if (!row) return false;
  const sd = s.sizeIdx === null ? row : row.sizeDetails?.[s.sizeIdx];
  if (!sd) return false;
  return sd.remainingMinutes >= 0.5 && sd.remainingMinutes < sd.productionMinutes - 0.5;
}

export interface QueueStatus {
  /** The custom queue still changes the order of the work left. */
  active: boolean;
  /** The next size to start (after the one in production, if any). */
  next?: SeqStep;
}

/**
 * Does a custom queue still change anything for the work left? Compares the
 * remaining steps in queue order with the remaining ones in form order: once
 * its re-arranged sizes are produced the two coincide → inactive, and the queue
 * is dropped automatically.
 */
export function queueStatus(
  queue: QueueItem[] | undefined,
  orders: Order[],
  result: ScheduleResult,
  /** When given, a step whose start time has come counts as in production
   *  too (not only a partly produced one) → `next` is the step after it. */
  now?: Date,
): QueueStatus {
  if (!queue?.length) return { active: false };
  const left = (s: SeqStep) => stepRemaining(result, s) >= 0.5;
  const custom = resolveSequence(queue, orders).filter(left);
  const natural = naturalSequence(orders).filter(left);
  const active = custom.some((s, i) => !sameStep(s, natural[i]));
  if (!active) return { active: false };
  const first = custom[0];
  const running =
    !!first &&
    (stepStarted(result, first) ||
      (!!now && stepStartTime(result, first) <= now.getTime()));
  const next = running ? (custom[1] ?? first) : first;
  return { active, next };
}

/** Scheduled start of a step in a computed result (epoch ms). */
function stepStartTime(result: ScheduleResult, s: SeqStep): number {
  const row = result.rows[s.orderIdx];
  const sd = s.sizeIdx === null ? row : row?.sizeDetails?.[s.sizeIdx];
  return sd ? sd.start.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * ⏹ "Ferma produzione" + pick: the step in production (`stopped`) is
 * interrupted by `target`, which runs now; the stopped one resumes right after
 * it. Produced amounts are untouched. Returns the new sequence.
 */
export function interruptWith(
  queue: QueueItem[] | undefined,
  orders: Order[],
  result: ScheduleResult,
  stopped: SeqStep,
  target: SeqStep,
): SeqStep[] {
  const seq = resolveSequence(queue, orders).filter(
    (s) => !sameStep(s, stopped) && !sameStep(s, target),
  );
  const firstLeft = seq.findIndex((s) => stepRemaining(result, s) >= 0.5);
  seq.splice(firstLeft < 0 ? seq.length : firstLeft, 0, target, stopped);
  return seq;
}

/**
 * ⏭ "Senza coda": move one size so it's produced next — right after the step
 * now in production (it finishes first), or first when nothing has started.
 * Returns the new sequence.
 */
export function prioritizeStep(
  queue: QueueItem[] | undefined,
  orders: Order[],
  result: ScheduleResult,
  target: SeqStep,
): SeqStep[] {
  const seq = resolveSequence(queue, orders).filter((s) => !sameStep(s, target));
  const firstLeft = seq.findIndex((s) => stepRemaining(result, s) >= 0.5);
  if (firstLeft < 0) return [...seq, target];
  const at = stepStarted(result, seq[firstLeft]) ? firstLeft + 1 : firstLeft;
  seq.splice(at, 0, target);
  return seq;
}
