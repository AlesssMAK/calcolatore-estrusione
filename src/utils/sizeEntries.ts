import type { ProducedEntry } from '../types';

type Entries = (ProducedEntry | undefined | null)[] | undefined | null;

/** The per-size tagged arrays of an order (Calcolo Avanzato), in groups whose
 *  rows are parallel by position: [count, rate, total] for sheets and
 *  [count, total] for profiles. */
export const SIZE_ENTRY_GROUPS = [
  ['producedSheets', 'sheetsPerPallet', 'producedPallets'],
  ['producedProfiles', 'producedPackages'],
] as const;
export type SizeEntryField = (typeof SIZE_ENTRY_GROUPS)[number][number];

/**
 * Re-point one group of parallel per-size arrays after the order's sizes
 * changed. `map(oldSizeIdx)` gives the size's new index, or null when it was
 * removed — its rows are then dropped from every array of the group, keeping
 * the arrays aligned. Untagged (legacy) rows use their position as the index.
 * Without this the rows stayed on the old index, so e.g. a size inserted in the
 * middle showed the next size's produced data.
 */
export function remapSizeGroup(
  arrays: Entries[],
  map: (sizeIdx: number) => number | null,
): ProducedEntry[][] {
  const len = Math.max(0, ...arrays.map((a) => a?.length ?? 0));
  const out = arrays.map(() => [] as ProducedEntry[]);
  for (let p = 0; p < len; p++) {
    const tagged = arrays.find((a) => a?.[p]?.sizeIndex != null)?.[p];
    const next = map(tagged?.sizeIndex ?? p);
    if (next === null) continue;
    arrays.forEach((a, i) => {
      const e = a?.[p];
      out[i].push(e ? { ...e, sizeIndex: next } : { value: undefined, sizeIndex: next });
    });
  }
  return out;
}

/** A size was inserted at `at`: sizes from `at` on move one down. */
export const insertMap =
  (at: number) =>
  (i: number): number =>
    i >= at ? i + 1 : i;

/** The size at `at` was removed: its rows go, later sizes move one up. */
export const removeMap =
  (at: number) =>
  (i: number): number | null =>
    i === at ? null : i > at ? i - 1 : i;

/** A size was moved from `from` to `to` (array-move semantics). */
export const moveMap =
  (from: number, to: number) =>
  (i: number): number => {
    if (i === from) return to;
    if (from < to && i > from && i <= to) return i - 1;
    if (to < from && i >= to && i < from) return i + 1;
    return i;
  };
