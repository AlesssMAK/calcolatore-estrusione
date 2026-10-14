// What differs between the author's original (Salvati) and the version in
// Produzione — matched by content, not position: orders by id, sizes by uid
// (by position only when a version has sizes without one), so a reorder shows
// as a reorder, not as everything changed.
//
// Two groups:
//  - plan: the orders, their order in the queue, their fields and sizes, and
//    the calc's settings — what the badge counts;
//  - progress ("Avanzamento"): what's produced — compared as of the same
//    moment, so the mere passing of time between two saves isn't a difference.

import type { FormValues } from '../formSchema';
import type {
  Order,
  OrderSize,
  ScheduleResult,
  ScheduleSnapshot,
  ScheduledOrder,
} from '../types';
import { progressAsOf } from './calculator';
import { effectiveValue } from './inherit';

/** One side of the comparison: a calc as stored (inputs + computed result). */
export interface CalcVersion {
  values: FormValues;
  result: ScheduleResult;
  completedRows?: ScheduledOrder[];
  snapshot?: ScheduleSnapshot;
}

export type DiffGroup = 'plan' | 'progress';

/** Settings compared: the calc's name, 24/7, "Calcolo fisso" / paused and the
 *  custom size queue. (Start time and schedule follow every recompute.) */
export type SettingKey = 'productName' | 'noLimits' | 'frozen' | 'queue';

/** Order fields compared (speed / cavity as they run — inherited or own). */
export type OrderField =
  | 'productName'
  | 'speedMPerMin'
  | 'cavity'
  | 'gapEnabled'
  | 'gapAfterMin'
  | 'useTotalLength'
  | 'totalLengthM'
  | 'sheets'
  | 'sheetLengthMm';

export type SizeField = 'sheets' | 'length' | 'profilesPerPackage';

export type CalcDiff =
  | { group: 'plan'; kind: 'setting'; key: SettingKey; original: unknown; production: unknown }
  | { group: 'plan'; kind: 'orderSequence'; original: string[]; production: string[] }
  | { group: 'plan'; kind: 'orderAdded'; orderId: string; order: Order }
  | { group: 'plan'; kind: 'orderRemoved'; orderId: string; order: Order }
  | {
      group: 'plan';
      kind: 'orderField';
      orderId: string;
      field: OrderField;
      original: unknown;
      production: unknown;
    }
  | {
      group: 'plan';
      kind: 'sizeSequence';
      orderId: string;
      original: string[];
      production: string[];
    }
  | { group: 'plan'; kind: 'sizeAdded'; orderId: string; sizeKey: string; size: OrderSize }
  | { group: 'plan'; kind: 'sizeRemoved'; orderId: string; sizeKey: string; size: OrderSize }
  | {
      group: 'plan';
      kind: 'sizeField';
      orderId: string;
      sizeKey: string;
      field: SizeField;
      original: unknown;
      production: unknown;
    }
  | {
      group: 'progress';
      kind: 'orderDone';
      orderId: string;
      original: boolean;
      production: boolean;
    }
  | {
      group: 'progress';
      kind: 'produced';
      orderId: string;
      sizeKey: string;
      original: number;
      production: number;
    };

const ORDER_FIELDS: OrderField[] = [
  'productName',
  'speedMPerMin',
  'cavity',
  'gapEnabled',
  'gapAfterMin',
  'useTotalLength',
  'totalLengthM',
  'sheets',
  'sheetLengthMm',
];
const SIZE_FIELDS: SizeField[] = ['sheets', 'length', 'profilesPerPackage'];

/** Blank / NaN → undefined, trimmed strings, false ≡ unset for flags. */
function norm(v: unknown): unknown {
  if (v === null || v === undefined || v === '' || v === false) return undefined;
  if (typeof v === 'number' && Number.isNaN(v)) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  return v;
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(norm(a) ?? null) === JSON.stringify(norm(b) ?? null);

/** Stable keys of an order's sizes: their uids, or "#<n>" (by position) when
 *  either version has a size without one. */
function sizeKeys(sizes: OrderSize[], byPosition: boolean): string[] {
  return sizes.map((s, i) => (byPosition || !s?.uid ? `#${i}` : s.uid));
}

/** Where the common items stand, in each version's own order. */
function commonOrder(a: string[], b: string[]): [string[], string[]] {
  const inB = new Set(b);
  const inA = new Set(a);
  return [a.filter((k) => inB.has(k)), b.filter((k) => inA.has(k))];
}

interface Side {
  /** Orders still in the queue, in queue order. */
  active: Order[];
  /** Every order — completed first (they ran first), then the active ones. */
  all: Order[];
  byId: Map<string, Order>;
  done: Set<string>;
}

function side(v: CalcVersion): Side {
  const completed = (v.completedRows ?? []).map((r) => r.order);
  const active = v.values.orders as Order[];
  const all = [...completed, ...active];
  return {
    active,
    all,
    byId: new Map(all.map((o) => [o.id, o])),
    done: new Set(completed.map((o) => o.id)),
  };
}

/** Produced pieces per size key (and done orders) as of `at`. A "Calcolo
 *  fisso" doesn't advance, so it counts as it was computed. */
function producedAt(
  v: CalcVersion,
  at: Date,
  byPositionFor: (orderId: string) => boolean,
): { perSize: Map<string, Map<string, number>>; done: Set<string> } {
  const perSize = new Map<string, Map<string, number>>();
  const done = new Set((v.completedRows ?? []).map((r) => r.order.id));
  const snapshot: ScheduleSnapshot = v.snapshot ?? {
    warmupMinutes: 0,
    shutdownMinutes: 0,
    schedule: null,
  };
  const when = v.values.settings.frozen ? v.result.startAt : at;
  const progress = progressAsOf(v.result, when, snapshot);
  v.result.rows.forEach((row, i) => {
    const p = progress.orders[i];
    if (!p) return;
    if (p.done) done.add(row.order.id);
    const keys = sizeKeys(row.order.sizes ?? [], byPositionFor(row.order.id));
    const counts = new Map<string, number>();
    if (row.order.useTotalLength) {
      counts.set('m', Math.round(p.producedLengthM ?? 0));
    } else {
      (p.producedCountPerSize ?? []).forEach((n, j) => {
        if (keys[j] !== undefined) counts.set(keys[j], n);
      });
    }
    perSize.set(row.order.id, counts);
  });
  return { perSize, done };
}

/**
 * Compare the original with the Produzione version. `at` is the moment the
 * progress is compared as of (now, by default).
 */
export function diffCalcs(
  original: CalcVersion,
  production: CalcVersion,
  at: Date = new Date(),
): CalcDiff[] {
  const out: CalcDiff[] = [];
  const o = side(original);
  const p = side(production);
  const os = original.values.settings;
  const ps = production.values.settings;

  // Settings.
  for (const key of ['productName', 'noLimits', 'frozen'] as const) {
    if (!same(os[key], ps[key])) {
      out.push({ group: 'plan', kind: 'setting', key, original: os[key], production: ps[key] });
    }
  }
  const queueOf = (q: FormValues['settings']['queue']) =>
    (q ?? []).map((s) => ({ orderId: s.orderId, sizeUid: s.sizeUid }));
  if (JSON.stringify(queueOf(os.queue)) !== JSON.stringify(queueOf(ps.queue))) {
    out.push({
      group: 'plan',
      kind: 'setting',
      key: 'queue',
      original: os.queue,
      production: ps.queue,
    });
  }

  // Orders only in one version (neither in its queue nor completed).
  for (const order of o.all) {
    if (!p.byId.has(order.id)) {
      out.push({ group: 'plan', kind: 'orderRemoved', orderId: order.id, order });
    }
  }
  for (const order of p.all) {
    if (!o.byId.has(order.id)) {
      out.push({ group: 'plan', kind: 'orderAdded', orderId: order.id, order });
    }
  }

  // Their order in the queue (the orders both still have queued).
  const [oSeq, pSeq] = commonOrder(
    o.active.map((x) => x.id),
    p.active.map((x) => x.id),
  );
  if (oSeq.join() !== pSeq.join()) {
    out.push({ group: 'plan', kind: 'orderSequence', original: oSeq, production: pSeq });
  }

  // Orders in both: fields and sizes.
  const byPosition = new Map<string, boolean>();
  for (const oo of o.all) {
    const po = p.byId.get(oo.id);
    if (!po) continue;
    const oi = o.all.indexOf(oo);
    const pi = p.all.indexOf(po);
    for (const field of ORDER_FIELDS) {
      let ov: unknown = oo[field];
      let pv: unknown = po[field];
      if (field === 'speedMPerMin' || field === 'cavity') {
        // Inheriting on both sides: any change comes from an earlier order,
        // already listed there. Otherwise compare as the order runs — a value
        // stamped on one side when an earlier order completed isn't a change.
        if (norm(ov) === undefined && norm(pv) === undefined) continue;
        ov = effectiveValue(o.all, oi, field);
        pv = effectiveValue(p.all, pi, field);
      }
      if (!same(ov, pv)) {
        out.push({
          group: 'plan',
          kind: 'orderField',
          orderId: oo.id,
          field,
          original: ov,
          production: pv,
        });
      }
    }

    const oSizes = oo.sizes ?? [];
    const pSizes = po.sizes ?? [];
    const positional = [...oSizes, ...pSizes].some((s) => !s?.uid);
    byPosition.set(oo.id, positional);
    const oKeys = sizeKeys(oSizes, positional);
    const pKeys = sizeKeys(pSizes, positional);
    oKeys.forEach((k, i) => {
      const j = pKeys.indexOf(k);
      if (j < 0) {
        out.push({
          group: 'plan',
          kind: 'sizeRemoved',
          orderId: oo.id,
          sizeKey: k,
          size: oSizes[i],
        });
        return;
      }
      for (const field of SIZE_FIELDS) {
        if (!same(oSizes[i]?.[field], pSizes[j]?.[field])) {
          out.push({
            group: 'plan',
            kind: 'sizeField',
            orderId: oo.id,
            sizeKey: k,
            field,
            original: oSizes[i]?.[field],
            production: pSizes[j]?.[field],
          });
        }
      }
    });
    pKeys.forEach((k, j) => {
      if (!oKeys.includes(k)) {
        out.push({
          group: 'plan',
          kind: 'sizeAdded',
          orderId: oo.id,
          sizeKey: k,
          size: pSizes[j],
        });
      }
    });
    const [oSz, pSz] = commonOrder(oKeys, pKeys);
    if (!positional && oSz.join() !== pSz.join()) {
      out.push({
        group: 'plan',
        kind: 'sizeSequence',
        orderId: oo.id,
        original: oSz,
        production: pSz,
      });
    }
  }

  // Progress, as of the same moment.
  const posFor = (id: string) => byPosition.get(id) ?? false;
  const oProd = producedAt(original, at, posFor);
  const pProd = producedAt(production, at, posFor);
  for (const oo of o.all) {
    if (!p.byId.has(oo.id)) continue;
    const oDone = oProd.done.has(oo.id);
    const pDone = pProd.done.has(oo.id);
    if (oDone !== pDone) {
      out.push({
        group: 'progress',
        kind: 'orderDone',
        orderId: oo.id,
        original: oDone,
        production: pDone,
      });
      continue; // done on one side: its pieces differ by definition
    }
    if (oDone) continue;
    const oc = oProd.perSize.get(oo.id);
    const pc = pProd.perSize.get(oo.id);
    if (!oc || !pc) continue;
    for (const [k, n] of oc) {
      const m = pc.get(k);
      // ±1 piece is rounding between two saves made at different moments.
      if (m !== undefined && Math.abs(m - n) > 1) {
        out.push({
          group: 'progress',
          kind: 'produced',
          orderId: oo.id,
          sizeKey: k,
          original: n,
          production: m,
        });
      }
    }
  }

  return out;
}

/** How many plan differences there are (what the Salvati badge shows). */
export const planDiffCount = (diffs: CalcDiff[]): number =>
  diffs.filter((d) => d.group === 'plan').length;
