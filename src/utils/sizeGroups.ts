// An order's sizes can be split into groups — a frame each in the order card,
// for the eye only: no pause, nothing changes in the calculation (the user's
// choice). A size carries its group's number (`group`, none = 0); a group is a
// run of consecutive sizes with the same number.

/** A size's group number (none: 0). */
export const groupOf = (s: { group?: number } | undefined | null): number =>
  s?.group ?? 0;

/** The sizes after `at` in its group go into a new group (split below it). */
export function splitAfter(groups: number[], at: number): number[] {
  const g = groups[at];
  const next = Math.max(...groups) + 1;
  const out = [...groups];
  for (let j = at + 1; j < out.length && groups[j] === g; j++) out[j] = next;
  return out;
}

/** The group just below `at` joins the one of `at` (merge across the line). */
export function mergeAfter(groups: number[], at: number): number[] {
  const g = groups[at];
  const h = groups[at + 1];
  const out = [...groups];
  for (let j = at + 1; j < out.length && groups[j] === h; j++) out[j] = g;
  return out;
}

/** After a size moved from `from` to `to`: it joins the group it was put in —
 *  its new neighbour's above (below, when it went first). */
export function afterMove(groups: number[], from: number, to: number): number[] {
  const out = [...groups];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved);
  out[to] = to > 0 ? out[to - 1] : (out[1] ?? moved);
  return out;
}

/** The runs of `order` (size indexes, in the order shown) whose sizes share a
 *  group — a frame each. */
export function groupRuns(order: number[], groups: number[]): number[][] {
  const runs: number[][] = [];
  order.forEach((i, k) => {
    if (k > 0 && groups[i] === groups[order[k - 1]]) runs[runs.length - 1].push(i);
    else runs.push([i]);
  });
  return runs;
}
