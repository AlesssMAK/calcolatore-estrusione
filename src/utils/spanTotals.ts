import type { ScheduledOrder } from '../types';
import { groupOf, groupRuns } from './sizeGroups';

// The time a size group (of an order) or a block (of orders, between two
// pauses) still takes, and when it ends — shown at its end in a tracked form
// and in the results.

export interface SpanTotal {
  /** What's left to make, in minutes. */
  minutes: number;
  /** When its last part ends. */
  end: Date;
}

/** What's left of some parts (sizes / orders) and when the last one ends.
 *  Null: no parts. */
export function spanTotal(
  parts: { remainingMinutes: number; end: Date | string }[],
): SpanTotal | null {
  if (parts.length === 0) return null;
  return {
    minutes: parts.reduce((s, p) => s + (p.remainingMinutes ?? 0), 0),
    end: new Date(Math.max(...parts.map((p) => new Date(p.end).getTime()))),
  };
}

/** A result row's size groups, by the size that closes each: its number, its
 *  title (if any) and its total. Only with two groups or more (and the
 *  sizes' details matching the sizes). */
export function sizeGroupEnds(
  row: ScheduledOrder,
): Map<number, { n: number; title?: string; total: SpanTotal }> {
  const out = new Map<number, { n: number; title?: string; total: SpanTotal }>();
  const sizes = row.order.sizes ?? [];
  const details = row.sizeDetails ?? [];
  if (sizes.length < 2 || details.length !== sizes.length) return out;
  const groups = sizes.map(groupOf);
  const runs = groupRuns(
    sizes.map((_, i) => i),
    groups,
  );
  if (runs.length < 2) return out;
  runs.forEach((run, k) => {
    const total = spanTotal(run.map((i) => details[i]));
    if (!total) return;
    const title = row.order.sizeGroupTitles?.[`g${groups[run[0]]}`]?.trim();
    out.set(run[run.length - 1], { n: k + 1, title: title || undefined, total });
  });
  return out;
}

/** The blocks of the queue (orders between two pauses), by the row that
 *  closes each: its number and its total. Only the rows still in the queue
 *  count (not the completed ones), so the numbers match the form's blocks.
 *  Only with two blocks or more, and only a block of two orders or more (one
 *  order's block is that order: its own time says it). */
export function blockEnds(
  rows: ScheduledOrder[],
): Map<number, { n: number; total: SpanTotal }> {
  const out = new Map<number, { n: number; total: SpanTotal }>();
  const live = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.completed);
  const ranges: number[][] = [[]];
  live.forEach(({ r, i }, k) => {
    ranges[ranges.length - 1].push(i);
    if (r.gapAfterMin > 0 && k < live.length - 1) ranges.push([]);
  });
  if (ranges.length < 2) return out;
  ranges.forEach((range, k) => {
    if (range.length < 2) return;
    const total = spanTotal(range.map((i) => rows[i]));
    if (total) out.set(range[range.length - 1], { n: k + 1, total });
  });
  return out;
}
