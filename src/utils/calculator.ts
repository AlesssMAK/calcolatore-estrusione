import type {
  CalculatorMode,
  GlobalSettings,
  Order,
  ProducedEntry,
  ScheduleResult,
  ScheduledOrder,
  ScheduledSizeDetail,
  WeekendDay,
  WeekendWork,
} from '../types';

export function sumEntries(entries: ProducedEntry[] | undefined): number {
  if (!entries) return 0;
  return entries.reduce((sum, e) => sum + (e?.value ?? 0), 0);
}

// Per-size sum, honoring entry.sizeIndex when present. For legacy entries
// without sizeIndex, falls back to array index (entry[i] belongs to size i).
// Always returns a non-negative number.
function sumEntriesForSize(
  entries: ProducedEntry[] | undefined,
  sizeIdx: number,
): number {
  if (!entries) return 0;
  let total = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e) continue;
    const tag = e.sizeIndex ?? i;
    if (tag === sizeIdx) total += e.value ?? 0;
  }
  return total;
}

// First non-zero value for a size. Used for rate-style fields
// (sheetsPerPallet) where duplicating across rows shouldn't accumulate —
// the user enters the rate once, additional rows usually leave it blank
// (or repeat the same value). Falls back to array index for legacy entries.
function firstNonZeroForSize(
  entries: ProducedEntry[] | undefined,
  sizeIdx: number,
): number {
  if (!entries) return 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e) continue;
    const tag = e.sizeIndex ?? i;
    if (tag === sizeIdx && (e.value ?? 0) > 0) return e.value!;
  }
  return 0;
}

// Resolve per-batch rate values (perPackage / perPallet) with inheritance.
// Each empty slot inherits from the previous filled one in this order, with a
// cross-order seed (lastValue) used for the first slot. Returns the effective
// values aligned to `count` batches plus the new "last" value to carry to the
// next order.
function resolvePerBatchRates(
  entries: ProducedEntry[] | undefined,
  count: number,
  lastValue: number | undefined,
): { values: (number | undefined)[]; finalLast: number | undefined } {
  const values: (number | undefined)[] = [];
  let prev = lastValue;
  for (let i = 0; i < count; i++) {
    const own = entries?.[i]?.value;
    const eff = own && own > 0 ? own : prev;
    values[i] = eff;
    if (eff && eff > 0) prev = eff;
  }
  return { values, finalLast: prev };
}

// Sum (count_i × length_mm_i / 1000) over paired entries. Used in
// useTotalLength mode where each produced batch may have its own length.
function sumProducedLengthM(
  counts: ProducedEntry[] | undefined,
  lengths: ProducedEntry[] | undefined,
): number {
  if (!counts || !lengths) return 0;
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i]?.value ?? 0;
    const l = lengths[i]?.value ?? 0;
    total += (c * l) / 1000;
  }
  return total;
}

// Σ (produced-for-size_i × sizes[i].length / 1000). Honors entry.sizeIndex
// when present (multiple partial-production entries per size). Used in
// sizes mode.
function sumProducedSizedLengthM(
  produced: ProducedEntry[] | undefined,
  order: Order,
): number {
  if (!produced || !order.sizes || order.sizes.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < order.sizes.length; i++) {
    const c = sumEntriesForSize(produced, i);
    const l = order.sizes[i]?.length ?? 0;
    total += (c * l) / 1000;
  }
  return total;
}

export function calculateTotalProfiles(order: Order): number | undefined {
  if (order.useTotalLength) return undefined;
  if (order.sizes && order.sizes.length > 0) {
    return order.sizes.reduce((sum, s) => sum + (s.sheets ?? 0), 0);
  }
  if (order.sheets !== undefined) return order.sheets;
  return undefined;
}

export function calculateOrderLengthM(order: Order): number {
  if (order.useTotalLength) {
    if (order.totalLengthM === undefined || order.totalLengthM <= 0) {
      throw new Error('totalLengthM required when useTotalLength is true');
    }
    return order.totalLengthM;
  }
  if (order.sizes && order.sizes.length > 0) {
    return order.sizes.reduce(
      (sum, s) => sum + ((s.sheets ?? 0) * (s.length ?? 0)) / 1000,
      0,
    );
  }
  if (order.sheets !== undefined && order.sheetLengthMm !== undefined) {
    return (order.sheets * order.sheetLengthMm) / 1000;
  }
  throw new Error('order needs sizes[], totalLengthM, or sheets+sheetLengthMm');
}

export function calculateProductionMinutes(
  order: Order,
  speedMPerMin: number,
): number {
  if (speedMPerMin <= 0) {
    throw new Error('speed must be > 0');
  }
  const cavity = order.cavity && order.cavity > 0 ? order.cavity : 1;
  return calculateOrderLengthM(order) / (speedMPerMin * cavity);
}

export function calculatePackages(
  count: number,
  perPackage: number | undefined,
): number | undefined {
  if (!perPackage || perPackage <= 0) return undefined;
  return Math.ceil(count / perPackage);
}

// Production line operates Mon 06:00 → Sat 06:00 in local time; the weekend
// (Sat 06:00 ↔ Mon 06:00) is skipped unless the operator enables a weekend
// shift (see WeekendWork), which opens a working window on Sat and/or Sun.
const WORKDAY_START_HOUR = 6;
const MIN_PER_DAY = 1440;

// Clamp to [0,24] and snap to a 30-min slot (the picker's granularity).
const clampHalf = (h: number) =>
  Math.min(24, Math.max(0, Math.round(h * 2) / 2));

/** Minutes-from-midnight of a Date (fractional for seconds/ms). */
function minuteOfDay(d: Date): number {
  return (
    d.getHours() * 60 +
    d.getMinutes() +
    d.getSeconds() / 60 +
    d.getMilliseconds() / 60_000
  );
}

/** A Date on the same calendar day as `day`, `minute` minutes past midnight
 *  (minute may be 1440 → next midnight). */
function atMinute(day: Date, minute: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minute);
  return d;
}

function mergeIntervals(iv: Array<[number, number]>): Array<[number, number]> {
  const sorted = iv.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** The working window of one weekend day, in minute-intervals. */
function weekendDayIntervals(day: WeekendDay | undefined): Array<[number, number]> {
  if (!day?.enabled) return [];
  if (day.full24) return [[0, MIN_PER_DAY]];
  const s = clampHalf(day.start) * 60;
  const e = clampHalf(day.end) * 60;
  return e > s ? [[s, e]] : [];
}

/** Working minute-intervals [start,end) within a given weekday, from the
 *  Mon 06:00 → Sat 06:00 block plus any enabled weekend window. */
function workingIntervals(
  dow: number,
  weekend?: WeekendWork,
): Array<[number, number]> {
  const wk = WORKDAY_START_HOUR * 60; // 360
  const iv: Array<[number, number]> = [];
  if (dow === 1) iv.push([wk, MIN_PER_DAY]); // Mon 06:00 → 24:00
  else if (dow >= 2 && dow <= 5) iv.push([0, MIN_PER_DAY]); // Tue–Fri
  else if (dow === 6) iv.push([0, wk]); // Sat 00:00 → 06:00 (weekday tail)

  if (weekend?.enabled) {
    if (dow === 6) iv.push(...weekendDayIntervals(weekend.sat));
    if (dow === 0) iv.push(...weekendDayIntervals(weekend.sun));
  }
  return mergeIntervals(iv);
}

/** The first working instant at or after `d`. */
function nextWorkingInstant(d: Date, weekend?: WeekendWork): Date {
  let cursor = new Date(d);
  for (let guard = 0; guard < 21; guard++) {
    const mod = minuteOfDay(cursor);
    for (const [s, e] of workingIntervals(cursor.getDay(), weekend)) {
      if (mod < e) return mod >= s ? cursor : atMinute(cursor, s);
    }
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(0, 0, 0, 0);
  }
  return cursor;
}

export function addWorkingMinutes(
  start: Date,
  minutes: number,
  weekend?: WeekendWork,
): Date {
  if (minutes <= 0) return new Date(start);
  let cursor = nextWorkingInstant(start, weekend);
  let remaining = minutes;
  for (let guard = 0; guard < 100_000 && remaining > 0; guard++) {
    const mod = minuteOfDay(cursor);
    let consumed = false;
    for (const [s, e] of workingIntervals(cursor.getDay(), weekend)) {
      if (mod >= e) continue;
      const from = mod >= s ? cursor : atMinute(cursor, s);
      const avail = e - Math.max(mod, s);
      if (remaining <= avail) {
        return new Date(from.getTime() + remaining * 60_000);
      }
      remaining -= avail;
      cursor = atMinute(cursor, e);
      consumed = true;
      break;
    }
    if (!consumed) {
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
    }
  }
  return cursor;
}

function resolveStartDate(settings: GlobalSettings, now: Date): Date {
  if (settings.startMode === 'now') {
    return now;
  }
  if (!settings.startAt) {
    throw new Error('startAt required when startMode is "manual"');
  }
  const parsed = new Date(settings.startAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('invalid startAt');
  }
  return parsed;
}

function resolveSpeed(
  order: Order,
  fallback: number | undefined,
): number {
  const candidate =
    order.speedMPerMin && order.speedMPerMin > 0
      ? order.speedMPerMin
      : fallback;
  if (!candidate || candidate <= 0) {
    throw new Error('speedMPerMin required on the first order');
  }
  return candidate;
}

export interface ProducedProfilesResult {
  totalProfiles?: number;
  producedProfiles: number;
  producedPackages: number;
  // undefined in useTotalLength mode (totals are unknown — only meters
  // produced/remaining are well-defined).
  remainingProfiles?: number;
  remainingPackages?: number;
  fraction: number;
}

export interface ProducedSheetsResult {
  totalSheets?: number;
  producedSheets: number;
  producedPallets?: number;
  sheetsPerPallet?: number;
  remainingSheets?: number;
  remainingPallets?: number;
  fraction: number;
}

export function calculateProducedProfiles(
  order: Order,
  perPackages: (number | undefined)[],
): ProducedProfilesResult | undefined {
  const packagesEntered = sumEntries(order.producedPackages);

  // Effective produced profiles per row:
  //   sizes-mode  → aggregate entries per size (sizeIndex-aware, with
  //                 fallback to array position). Lets a single size accept
  //                 multiple partial-production entries (e.g. day-by-day).
  //   useTotalLength → flat batch indexing.
  const sizesLen = order.sizes?.length ?? 0;
  const effectiveProfiles: number[] = [];
  if (order.useTotalLength) {
    const rowsLen = Math.max(
      order.producedProfiles?.length ?? 0,
      order.producedPackages?.length ?? 0,
      perPackages.length,
    );
    for (let i = 0; i < rowsLen; i++) {
      const profI = order.producedProfiles?.[i]?.value ?? 0;
      if (profI > 0) {
        effectiveProfiles[i] = profI;
        continue;
      }
      const packI = order.producedPackages?.[i]?.value ?? 0;
      const ppI = perPackages[i];
      if (packI > 0 && ppI && ppI > 0) {
        effectiveProfiles[i] = packI * ppI;
      } else {
        effectiveProfiles[i] = 0;
      }
    }
  } else {
    for (let i = 0; i < sizesLen; i++) {
      const profI = sumEntriesForSize(order.producedProfiles, i);
      if (profI > 0) {
        effectiveProfiles[i] = profI;
        continue;
      }
      const packI = sumEntriesForSize(order.producedPackages, i);
      const ppI = perPackages[i];
      if (packI > 0 && ppI && ppI > 0) {
        effectiveProfiles[i] = packI * ppI;
      } else {
        effectiveProfiles[i] = 0;
      }
    }
  }
  const producedProfiles = effectiveProfiles.reduce((s, v) => s + v, 0);

  if (producedProfiles === 0 && packagesEntered === 0) return undefined;

  // In useTotalLength mode, total profiles count is unknown when batches have
  // different lengths; only producedLengthM is well-defined.
  const totalProfiles = order.useTotalLength
    ? undefined
    : calculateTotalProfiles(order);

  const cappedProduced =
    totalProfiles !== undefined
      ? Math.min(producedProfiles, totalProfiles)
      : producedProfiles;

  // Per-size totals/produced packages: sum ceil(sizes[i].sheets / perPackages[i]).
  let totalPackages: number | undefined;
  let producedPackagesCount = 0;
  if (!order.useTotalLength && order.sizes) {
    let totalAcc = 0;
    let totalKnown = false;
    for (let i = 0; i < order.sizes.length; i++) {
      const pp = perPackages[i];
      const sheetsI = order.sizes[i]?.sheets ?? 0;
      if (pp && pp > 0) {
        if (sheetsI > 0) {
          totalAcc += Math.ceil(sheetsI / pp);
          totalKnown = true;
        }
        producedPackagesCount += Math.ceil(effectiveProfiles[i] / pp);
      }
    }
    totalPackages = totalKnown ? totalAcc : undefined;
  } else if (order.useTotalLength) {
    // Per-batch packages — but the rate-path (packages × perPackage) is
    // mutually exclusive with the direct path: if any producedProfiles[i] > 0
    // the user is on the direct path and stale values in producedPackages
    // (left over after switching paths) must NOT be summed. In that case
    // derive packages from effective profiles instead.
    const directProfilesEntered =
      sumEntries(order.producedProfiles) > 0;
    for (
      let i = 0;
      i < Math.max(effectiveProfiles.length, order.producedPackages?.length ?? 0);
      i++
    ) {
      if (!directProfilesEntered) {
        const directPack = order.producedPackages?.[i]?.value ?? 0;
        if (directPack > 0) {
          producedPackagesCount += directPack;
          continue;
        }
      }
      const pp = perPackages[i];
      if (pp && pp > 0 && effectiveProfiles[i]) {
        producedPackagesCount += Math.ceil(effectiveProfiles[i] / pp);
      }
    }
  }

  const remainingProfiles =
    totalProfiles !== undefined
      ? Math.max(0, totalProfiles - cappedProduced)
      : undefined;
  const remainingPackages =
    totalPackages !== undefined
      ? Math.max(0, totalPackages - producedPackagesCount)
      : undefined;

  let fraction = 0;
  if (order.useTotalLength) {
    if (order.totalLengthM && order.totalLengthM > 0) {
      // Sum effective profiles × itemLength per batch — covers the
      // packages-only path (perPackage × packages) too.
      const lengths = order.producedItemLength;
      let producedLengthM = 0;
      for (let i = 0; i < effectiveProfiles.length; i++) {
        const l = lengths?.[i]?.value ?? 0;
        producedLengthM += (effectiveProfiles[i] * l) / 1000;
      }
      if (producedLengthM > 0) {
        fraction = Math.min(1, producedLengthM / order.totalLengthM);
      }
    }
  } else if (totalProfiles && totalProfiles > 0) {
    const orderLengthM = calculateOrderLengthM(order);
    const sizedEntries: ProducedEntry[] = effectiveProfiles.map((v) => ({
      value: v,
    }));
    const producedLengthM = sumProducedSizedLengthM(sizedEntries, order);
    if (producedLengthM > 0 && orderLengthM > 0) {
      fraction = Math.min(1, producedLengthM / orderLengthM);
    } else {
      fraction = cappedProduced / totalProfiles;
    }
  }

  return {
    totalProfiles,
    producedProfiles: cappedProduced,
    producedPackages: producedPackagesCount,
    remainingProfiles,
    remainingPackages,
    fraction,
  };
}

function calculateProducedSheetsBatched(
  order: Order,
  perPallets: (number | undefined)[],
): ProducedSheetsResult | undefined {
  const batchLen = Math.max(
    order.producedSheets?.length ?? 0,
    order.producedPallets?.length ?? 0,
    order.sheetsPerPallet?.length ?? 0,
    order.producedItemLength?.length ?? 0,
    perPallets.length,
  );
  if (batchLen === 0) return undefined;

  // Mutex between direct path (producedSheets) and rate path
  // (sheetsPerPallet × producedPallets): the user only fills one side. If
  // both have stale values, the direct path wins — disabled producedPallets
  // values must NOT be summed.
  const directSheetsEntered = sumEntries(order.producedSheets) > 0;

  let totalSheetsProduced = 0;
  let totalPalletsProduced = 0;
  let producedLengthM = 0;
  let anyEntered = false;

  for (let i = 0; i < batchLen; i++) {
    const directSheets = order.producedSheets?.[i]?.value ?? 0;
    const palletsI = directSheetsEntered
      ? 0
      : order.producedPallets?.[i]?.value ?? 0;
    const perPalletI = perPallets[i];
    const lengthI = order.producedItemLength?.[i]?.value ?? 0;

    let effectiveSheets = 0;
    if (directSheets > 0) {
      effectiveSheets = directSheets;
      anyEntered = true;
    } else if (palletsI > 0 && perPalletI && perPalletI > 0) {
      effectiveSheets = palletsI * perPalletI;
      anyEntered = true;
    }

    totalSheetsProduced += effectiveSheets;
    producedLengthM += (effectiveSheets * lengthI) / 1000;

    if (palletsI > 0) {
      totalPalletsProduced += palletsI;
      anyEntered = true;
    } else if (effectiveSheets > 0 && perPalletI && perPalletI > 0) {
      totalPalletsProduced += Math.ceil(effectiveSheets / perPalletI);
    }
  }

  if (!anyEntered) return undefined;

  let fraction = 0;
  if (order.totalLengthM && order.totalLengthM > 0 && producedLengthM > 0) {
    fraction = Math.min(1, producedLengthM / order.totalLengthM);
  }

  return {
    totalSheets: undefined,
    producedSheets: totalSheetsProduced,
    producedPallets: totalPalletsProduced > 0 ? totalPalletsProduced : undefined,
    // Per-batch rate is non-uniform; expose undefined to avoid misleading
    // a single scalar in the results table.
    sheetsPerPallet: undefined,
    remainingSheets: undefined,
    remainingPallets: undefined,
    fraction,
  };
}

export function calculateProducedSheets(
  order: Order,
  perBatchPerPallets?: (number | undefined)[],
): ProducedSheetsResult | undefined {
  if (order.useTotalLength && perBatchPerPallets) {
    return calculateProducedSheetsBatched(order, perBatchPerPallets);
  }
  const sheetsEntered = sumEntries(order.producedSheets);
  const palletsEntered = sumEntries(order.producedPallets);
  const perPalletSum = sumEntries(order.sheetsPerPallet);
  const sheetsPerPallet = perPalletSum > 0 ? perPalletSum : undefined;

  let producedSheets = 0;
  if (sheetsEntered > 0) {
    producedSheets = sheetsEntered;
  } else if (palletsEntered > 0 && sheetsPerPallet) {
    producedSheets = palletsEntered * sheetsPerPallet;
  }

  if (
    producedSheets === 0 &&
    sheetsEntered === 0 &&
    palletsEntered === 0 &&
    !sheetsPerPallet
  ) {
    return undefined;
  }

  // In useTotalLength mode, total sheets count is unknown when batches have
  // different lengths; only producedLengthM is well-defined.
  const totalSheets = order.useTotalLength
    ? undefined
    : calculateTotalProfiles(order);

  const cappedProduced =
    totalSheets !== undefined
      ? Math.min(producedSheets, totalSheets)
      : producedSheets;

  const producedPallets = sheetsPerPallet
    ? Math.ceil(cappedProduced / sheetsPerPallet)
    : undefined;

  const remainingSheets =
    totalSheets !== undefined
      ? Math.max(0, totalSheets - cappedProduced)
      : undefined;
  const remainingPallets =
    totalSheets !== undefined && sheetsPerPallet
      ? Math.max(
          0,
          Math.ceil(totalSheets / sheetsPerPallet) - (producedPallets ?? 0),
        )
      : undefined;

  let fraction = 0;
  if (order.useTotalLength) {
    if (order.totalLengthM && order.totalLengthM > 0) {
      const producedLengthM =
        sheetsEntered > 0
          ? sumProducedLengthM(order.producedSheets, order.producedItemLength)
          : 0;
      if (producedLengthM > 0) {
        fraction = Math.min(1, producedLengthM / order.totalLengthM);
      }
    }
  } else if (totalSheets && totalSheets > 0) {
    // Per-size produced length when produced array is index-aligned to sizes.
    // Pallets × per-pallet acts as a fallback per row.
    const orderLengthM = calculateOrderLengthM(order);
    let producedLengthM = 0;
    if (sheetsEntered > 0) {
      producedLengthM = sumProducedSizedLengthM(order.producedSheets, order);
    } else if (
      palletsEntered > 0 &&
      order.producedPallets &&
      order.sheetsPerPallet &&
      order.sizes
    ) {
      // Per-size: pallets sum × rate (first non-zero) — tag-aware.
      const sized: ProducedEntry[] = order.sizes.map((_, sIdx) => ({
        sizeIndex: sIdx,
        value:
          sumEntriesForSize(order.producedPallets, sIdx) *
          firstNonZeroForSize(order.sheetsPerPallet, sIdx),
      }));
      producedLengthM = sumProducedSizedLengthM(sized, order);
    }
    if (producedLengthM > 0 && orderLengthM > 0) {
      fraction = Math.min(1, producedLengthM / orderLengthM);
    } else {
      fraction = cappedProduced / totalSheets;
    }
  }

  return {
    totalSheets,
    producedSheets: cappedProduced,
    producedPallets,
    sheetsPerPallet,
    remainingSheets,
    remainingPallets,
    fraction,
  };
}

interface ScheduleOptions {
  now?: Date;
  mode?: CalculatorMode;
}

export function calculateSchedule(
  settings: GlobalSettings,
  orders: Order[],
  options: ScheduleOptions = {},
): ScheduleResult {
  if (orders.length === 0) {
    throw new Error('at least one order is required');
  }

  const now = options.now ?? new Date();
  const mode: CalculatorMode = options.mode ?? 'sheets';

  const weekend = settings.weekend;
  const rawStart = resolveStartDate(settings, now);
  const startAt = nextWorkingInstant(rawStart, weekend);
  let cursor = startAt;
  const rows: ScheduledOrder[] = [];
  let totalProductionMinutes = 0;
  let totalGapMinutes = 0;
  const totalPackages: number | undefined = undefined;
  let lastSpeed: number | undefined;
  let lastPerPackage: number | undefined;
  let lastSheetsPerPallet: number | undefined;
  let lastCavity: number | undefined;

  orders.forEach((order, idx) => {
    const speedMPerMin = resolveSpeed(order, lastSpeed);
    lastSpeed = speedMPerMin;
    // Cavity multiplier (profiles only — multi-cavity dies emit several
    // strands simultaneously, so the line completes the order N× faster).
    // Profiles-only by UI, but the math is mode-agnostic: undefined → 1,
    // so sheets orders are unaffected.
    const ownCavity =
      order.cavity && order.cavity > 0 ? order.cavity : undefined;
    const cavity = ownCavity ?? lastCavity ?? 1;
    if (ownCavity) lastCavity = ownCavity;
    const effectiveSpeed = speedMPerMin * cavity;
    const totalLengthM = calculateOrderLengthM(order);
    const productionMinutes = totalLengthM / effectiveSpeed;

    const isLast = idx === orders.length - 1;
    const gapAfterMin =
      !isLast && settings.gapMode === 'withGaps'
        ? Math.max(0, order.gapAfterMin ?? 0)
        : 0;

    let packages: number | undefined;
    let totalProfiles: number | undefined;
    let producedProfiles: number | undefined;
    let producedPackages: number | undefined;
    let remainingProfiles: number | undefined;
    let remainingPackages: number | undefined;
    let totalSheets: number | undefined;
    let producedSheetsCount: number | undefined;
    let producedPallets: number | undefined;
    let sheetsPerPalletVal: number | undefined;
    let remainingSheets: number | undefined;
    let remainingPallets: number | undefined;
    let fraction = 0;
    const perPackagesForOrder: (number | undefined)[] = [];

    if (mode === 'profiles') {
      // Resolve per-size or per-batch profilesPerPackage with inheritance.
      // lastPerPackage carries over from earlier orders.
      const sizes = order.sizes ?? [];
      if (order.useTotalLength) {
        const batchLen = Math.max(
          order.producedProfiles?.length ?? 0,
          order.producedPackages?.length ?? 0,
          order.profilesPerPackage?.length ?? 0,
          order.producedItemLength?.length ?? 0,
          1,
        );
        const resolved = resolvePerBatchRates(
          order.profilesPerPackage,
          batchLen,
          lastPerPackage,
        );
        for (let i = 0; i < batchLen; i++) {
          perPackagesForOrder[i] = resolved.values[i];
        }
        lastPerPackage = resolved.finalLast;
      } else {
        for (let i = 0; i < sizes.length; i++) {
          const own = sizes[i]?.profilesPerPackage;
          const eff = own && own > 0 ? own : lastPerPackage;
          perPackagesForOrder[i] = eff;
          if (eff && eff > 0) lastPerPackage = eff;
        }
      }

      totalProfiles = calculateTotalProfiles(order);

      // Total packages per row = Σ ceil(sizes[i].sheets / perPackagesForOrder[i]).
      if (!order.useTotalLength && sizes.length > 0) {
        let pkgAcc = 0;
        let pkgKnown = false;
        for (let i = 0; i < sizes.length; i++) {
          const pp = perPackagesForOrder[i];
          const sheetsI = sizes[i]?.sheets ?? 0;
          if (pp && pp > 0 && sheetsI > 0) {
            pkgAcc += Math.ceil(sheetsI / pp);
            pkgKnown = true;
          }
        }
        if (pkgKnown) packages = pkgAcc;
      }

      const produced = calculateProducedProfiles(order, perPackagesForOrder);
      if (produced) {
        totalProfiles = produced.totalProfiles ?? totalProfiles;
        producedProfiles = produced.producedProfiles;
        producedPackages = produced.producedPackages;
        remainingProfiles = produced.remainingProfiles;
        remainingPackages = produced.remainingPackages;
        fraction = produced.fraction;
      }
    } else {
      let perBatchPerPallets: (number | undefined)[] | undefined;
      if (order.useTotalLength) {
        const batchLen = Math.max(
          order.producedSheets?.length ?? 0,
          order.producedPallets?.length ?? 0,
          order.sheetsPerPallet?.length ?? 0,
          order.producedItemLength?.length ?? 0,
          1,
        );
        const resolved = resolvePerBatchRates(
          order.sheetsPerPallet,
          batchLen,
          lastSheetsPerPallet,
        );
        perBatchPerPallets = resolved.values;
        lastSheetsPerPallet = resolved.finalLast;
      }
      const produced = calculateProducedSheets(order, perBatchPerPallets);
      if (produced) {
        totalSheets = produced.totalSheets ?? totalSheets;
        producedSheetsCount = produced.producedSheets;
        producedPallets = produced.producedPallets;
        sheetsPerPalletVal = produced.sheetsPerPallet;
        remainingSheets = produced.remainingSheets;
        remainingPallets = produced.remainingPallets;
        fraction = produced.fraction;
      }
    }

    const remainingMinutes = productionMinutes * Math.max(0, 1 - fraction);
    const start = nextWorkingInstant(cursor, weekend);
    const end = addWorkingMinutes(start, remainingMinutes, weekend);

    // Per-size breakdown when an order has 2+ sizes (sizes-mode only —
    // useTotalLength has no per-size structure to break out).
    let sizeDetails: ScheduledSizeDetail[] | undefined;
    if (!order.useTotalLength && order.sizes && order.sizes.length > 1) {
      sizeDetails = [];
      let sizeCursor = start;
      for (let i = 0; i < order.sizes.length; i++) {
        const sz = order.sizes[i];
        const sheetsI = sz?.sheets ?? 0;
        const lengthI = sz?.length ?? 0;
        const metersI = (sheetsI * lengthI) / 1000;
        const minsI = effectiveSpeed > 0 ? metersI / effectiveSpeed : 0;
        const ppI = mode === 'profiles' ? perPackagesForOrder[i] : undefined;
        const totalPkgI =
          ppI && ppI > 0 && sheetsI > 0 ? Math.ceil(sheetsI / ppI) : undefined;

        // Per-size produced (profiles or sheets) — effective value.
        let producedProfilesI: number | undefined;
        let producedPackagesI: number | undefined;
        let remainingProfilesI: number | undefined;
        let remainingPackagesI: number | undefined;
        let producedSheetsI: number | undefined;
        let producedPalletsI: number | undefined;
        let remainingSheetsI: number | undefined;
        let remainingPalletsI: number | undefined;
        let perPalletI: number | undefined;
        let sizeFraction = 0;

        if (mode === 'profiles') {
          const profI = sumEntriesForSize(order.producedProfiles, i);
          const packI = sumEntriesForSize(order.producedPackages, i);
          let effProfI = 0;
          if (profI > 0) {
            effProfI = profI;
          } else if (packI > 0 && ppI && ppI > 0) {
            effProfI = packI * ppI;
          }
          if (effProfI > 0 || packI > 0) {
            const cappedI =
              sheetsI > 0 ? Math.min(effProfI, sheetsI) : effProfI;
            producedProfilesI = cappedI;
            if (ppI && ppI > 0) {
              producedPackagesI = Math.ceil(cappedI / ppI);
              if (totalPkgI !== undefined) {
                remainingPackagesI = Math.max(
                  0,
                  totalPkgI - producedPackagesI,
                );
              }
            }
            if (sheetsI > 0) {
              remainingProfilesI = Math.max(0, sheetsI - cappedI);
              sizeFraction = cappedI / sheetsI;
            }
          }
        } else {
          const sheetsEnt = sumEntriesForSize(order.producedSheets, i);
          const perPalletEnt = firstNonZeroForSize(order.sheetsPerPallet, i);
          const palletsEnt = sumEntriesForSize(order.producedPallets, i);
          // Inherit sheetsPerPallet from the previous size in this order,
          // or from the last filled value across earlier orders.
          perPalletI =
            perPalletEnt > 0 ? perPalletEnt : lastSheetsPerPallet;
          if (perPalletI && perPalletI > 0) lastSheetsPerPallet = perPalletI;
          let effSheetsI = 0;
          if (sheetsEnt > 0) {
            effSheetsI = sheetsEnt;
          } else if (palletsEnt > 0 && perPalletI) {
            effSheetsI = palletsEnt * perPalletI;
          }
          if (effSheetsI > 0 || palletsEnt > 0 || perPalletI) {
            const cappedI =
              sheetsI > 0 ? Math.min(effSheetsI, sheetsI) : effSheetsI;
            producedSheetsI = cappedI;
            if (perPalletI) {
              producedPalletsI = Math.ceil(cappedI / perPalletI);
              if (sheetsI > 0) {
                const totalPalI = Math.ceil(sheetsI / perPalletI);
                remainingPalletsI = Math.max(0, totalPalI - producedPalletsI);
              }
            }
            if (sheetsI > 0) {
              remainingSheetsI = Math.max(0, sheetsI - cappedI);
              sizeFraction = cappedI / sheetsI;
            }
          }
        }

        const remainingMinsI = minsI * Math.max(0, 1 - sizeFraction);
        const startI = nextWorkingInstant(sizeCursor, weekend);
        const endI = addWorkingMinutes(startI, remainingMinsI, weekend);

        // Per-unit (pallet/package) metrics for this size — set only if the
        // rate is known. Used by the UI's "Tempo per bancale/pacco" row and
        // the optional per-unit timeline.
        let timePerUnitMinI: number | undefined;
        let totalUnitsI: number | undefined;
        if (mode === 'profiles' && ppI && ppI > 0 && lengthI > 0 && sheetsI > 0) {
          timePerUnitMinI = (ppI * lengthI) / 1000 / effectiveSpeed;
          totalUnitsI = Math.ceil(sheetsI / ppI);
        } else if (
          mode === 'sheets' &&
          perPalletI &&
          perPalletI > 0 &&
          lengthI > 0 &&
          sheetsI > 0
        ) {
          timePerUnitMinI = (perPalletI * lengthI) / 1000 / effectiveSpeed;
          totalUnitsI = Math.ceil(sheetsI / perPalletI);
        }

        sizeDetails.push({
          sheets: sheetsI,
          length: lengthI,
          metersM: metersI,
          productionMinutes: minsI,
          remainingMinutes: remainingMinsI,
          perPackage: ppI,
          packages: totalPkgI,
          producedProfiles: producedProfilesI,
          producedPackages: producedPackagesI,
          remainingProfiles: remainingProfilesI,
          remainingPackages: remainingPackagesI,
          sheetsPerPalletAtSize: perPalletI,
          producedSheetsAtSize: producedSheetsI,
          producedPalletsAtSize: producedPalletsI,
          remainingSheetsAtSize: remainingSheetsI,
          remainingPalletsAtSize: remainingPalletsI,
          timePerUnitMin: timePerUnitMinI,
          totalUnits: totalUnitsI,
          start: startI,
          end: endI,
        });
        sizeCursor = endI;
      }
    }

    const hasAnyProduced =
      producedProfiles !== undefined || producedSheetsCount !== undefined;
    const producedLengthM = hasAnyProduced
      ? totalLengthM * fraction
      : undefined;
    const remainingLengthM = hasAnyProduced
      ? totalLengthM * (1 - fraction)
      : undefined;

    // Per-unit (pallet/package) metrics for the order — populated only when
    // we're in sizes-mode with exactly one size and the rate is known.
    // Multi-size orders carry per-size values inside sizeDetails instead.
    let timePerUnitMinRow: number | undefined;
    let totalUnitsRow: number | undefined;
    const sizesArr = order.sizes ?? [];
    if (!order.useTotalLength && sizesArr.length === 1 && effectiveSpeed > 0) {
      const sz0 = sizesArr[0];
      const sheets0 = sz0?.sheets ?? 0;
      const length0 = sz0?.length ?? 0;
      if (sheets0 > 0 && length0 > 0) {
        if (mode === 'profiles') {
          const pp0 = perPackagesForOrder[0];
          if (pp0 && pp0 > 0) {
            timePerUnitMinRow = (pp0 * length0) / 1000 / effectiveSpeed;
            totalUnitsRow = Math.ceil(sheets0 / pp0);
          }
        } else {
          const perPallet0 =
            firstNonZeroForSize(order.sheetsPerPallet, 0) ||
            lastSheetsPerPallet;
          if (perPallet0 && perPallet0 > 0) {
            timePerUnitMinRow = (perPallet0 * length0) / 1000 / effectiveSpeed;
            totalUnitsRow = Math.ceil(sheets0 / perPallet0);
          }
        }
      }
    }

    rows.push({
      order,
      speedMPerMin,
      totalLengthM,
      productionMinutes,
      remainingMinutes,
      start,
      end,
      sizeDetails,
      gapAfterMin,
      packages,
      totalProfiles,
      producedProfiles,
      producedPackages,
      remainingProfiles,
      remainingPackages,
      totalSheets,
      producedSheets: producedSheetsCount,
      producedPallets,
      sheetsPerPallet: sheetsPerPalletVal,
      remainingSheets,
      remainingPallets,
      producedLengthM,
      remainingLengthM,
      timePerUnitMin: timePerUnitMinRow,
      totalUnits: totalUnitsRow,
    });

    totalProductionMinutes += remainingMinutes;
    totalGapMinutes += gapAfterMin;
    cursor = addWorkingMinutes(end, gapAfterMin, weekend);
  });

  const endAt = rows[rows.length - 1]!.end;

  const productName = settings.productName?.trim();
  return {
    rows,
    startAt,
    endAt,
    totalProductionMinutes,
    totalGapMinutes,
    totalDurationMinutes: (endAt.getTime() - startAt.getTime()) / 60_000,
    totalPackages,
    mode,
    productName: productName ? productName : undefined,
  };
}

export function splitDuration(totalMinutes: number): {
  days: number;
  hours: number;
  minutes: number;
} {
  const total = Math.max(0, Math.round(totalMinutes));
  return {
    days: Math.floor(total / 1440),
    hours: Math.floor((total % 1440) / 60),
    minutes: total % 60,
  };
}
