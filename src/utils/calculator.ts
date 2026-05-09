import type {
  CalculatorMode,
  GlobalSettings,
  Order,
  ProducedEntry,
  ScheduleResult,
  ScheduledOrder,
} from '../types';

export function sumEntries(entries: ProducedEntry[] | undefined): number {
  if (!entries) return 0;
  return entries.reduce((sum, e) => sum + (e?.value ?? 0), 0);
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

// Sum (produced[i] × sizes[i].length / 1000) — produced array is index-aligned
// to the order's sizes. Used in sizes mode.
function sumProducedSizedLengthM(
  produced: ProducedEntry[] | undefined,
  order: Order,
): number {
  if (!produced || !order.sizes || order.sizes.length === 0) return 0;
  const n = Math.min(produced.length, order.sizes.length);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const c = produced[i]?.value ?? 0;
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
  return calculateOrderLengthM(order) / speedMPerMin;
}

export function calculatePackages(
  count: number,
  perPackage: number | undefined,
): number | undefined {
  if (!perPackage || perPackage <= 0) return undefined;
  return Math.ceil(count / perPackage);
}

// Production line operates Mon 06:00 → Sat 06:00 in local time.
// Weekend (Sat 06:00 inclusive ↔ Mon 06:00 exclusive) is skipped.
const WORKDAY_START_HOUR = 6;

function isWeekend(d: Date): boolean {
  const dow = d.getDay(); // 0 = Sun, 6 = Sat
  if (dow === 0) return true;
  // Sat: weekend starts at 06:00 inclusive
  if (dow === 6) return d.getHours() >= WORKDAY_START_HOUR;
  // Mon: weekend ends at 06:00 (06:00 itself is already working time)
  if (dow === 1 && d.getHours() < WORKDAY_START_HOUR) return true;
  return false;
}

function skipWeekendForward(d: Date): Date {
  if (!isWeekend(d)) return d;
  const dow = d.getDay();
  // Mon < 06:00 → today; Sat → +2 days; Sun → +1 day.
  const daysAhead = dow === 6 ? 2 : dow === 0 ? 1 : 0;
  const next = new Date(d);
  next.setDate(d.getDate() + daysAhead);
  next.setHours(WORKDAY_START_HOUR, 0, 0, 0);
  return next;
}

// Returns the next Sat 06:00 strictly after `d`, assuming `d` is in a working
// window (Mon 06:00 ↔ Sat 06:00 exclusive).
function nextSaturdayMorning(d: Date): Date {
  const dow = d.getDay();
  // Sat 00:00–06:00 still in current working window → same Sat date at 06:00.
  const daysAhead = dow === 6 ? 0 : 6 - dow;
  const sat = new Date(d);
  sat.setDate(d.getDate() + daysAhead);
  sat.setHours(WORKDAY_START_HOUR, 0, 0, 0);
  return sat;
}

function addWorkingMinutes(start: Date, minutes: number): Date {
  if (minutes <= 0) return new Date(start);
  let cursor = skipWeekendForward(start);
  let remaining = minutes;
  while (remaining > 0) {
    const wkEnd = nextSaturdayMorning(cursor);
    const availMins = (wkEnd.getTime() - cursor.getTime()) / 60_000;
    if (remaining <= availMins) {
      return new Date(cursor.getTime() + remaining * 60_000);
    }
    remaining -= availMins;
    cursor = skipWeekendForward(wkEnd); // Sat 06:00 → Mon 06:00
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
  remainingProfiles: number;
  remainingPackages: number;
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
  perPackage: number | undefined,
): ProducedProfilesResult | undefined {
  const profilesEntered = sumEntries(order.producedProfiles);
  const packagesEntered = sumEntries(order.producedPackages);

  let producedProfiles = 0;
  if (profilesEntered > 0) {
    producedProfiles = profilesEntered;
  } else if (packagesEntered > 0 && perPackage && perPackage > 0) {
    producedProfiles = packagesEntered * perPackage;
  }

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

  const totalPackages =
    totalProfiles !== undefined && perPackage && perPackage > 0
      ? Math.ceil(totalProfiles / perPackage)
      : undefined;
  const producedPackages =
    perPackage && perPackage > 0
      ? Math.ceil(cappedProduced / perPackage)
      : 0;
  const remainingProfiles =
    totalProfiles !== undefined ? Math.max(0, totalProfiles - cappedProduced) : 0;
  const remainingPackages =
    totalPackages !== undefined ? Math.max(0, totalPackages - producedPackages) : 0;

  let fraction = 0;
  if (order.useTotalLength) {
    if (order.totalLengthM && order.totalLengthM > 0) {
      const producedLengthM =
        profilesEntered > 0
          ? sumProducedLengthM(
              order.producedProfiles,
              order.producedItemLength,
            )
          : 0;
      if (producedLengthM > 0) {
        fraction = Math.min(1, producedLengthM / order.totalLengthM);
      }
    }
  } else if (totalProfiles && totalProfiles > 0) {
    // Per-size produced length when produced array is index-aligned to sizes.
    // Falls back to count-fraction if produced totals aren't entered per row.
    const orderLengthM = calculateOrderLengthM(order);
    let producedLengthM = 0;
    if (profilesEntered > 0) {
      producedLengthM = sumProducedSizedLengthM(order.producedProfiles, order);
    } else if (
      packagesEntered > 0 &&
      perPackage &&
      perPackage > 0 &&
      order.producedPackages
    ) {
      // Pack count → profile count via global perPackage, then × size length.
      const sized: ProducedEntry[] = order.producedPackages.map((e) => ({
        value: (e?.value ?? 0) * perPackage,
      }));
      producedLengthM = sumProducedSizedLengthM(sized, order);
    }
    if (producedLengthM > 0 && orderLengthM > 0) {
      fraction = Math.min(1, producedLengthM / orderLengthM);
    } else {
      fraction = cappedProduced / totalProfiles;
    }
  }

  return {
    totalProfiles,
    producedProfiles: cappedProduced,
    producedPackages,
    remainingProfiles,
    remainingPackages,
    fraction,
  };
}

export function calculateProducedSheets(
  order: Order,
): ProducedSheetsResult | undefined {
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
      order.sheetsPerPallet
    ) {
      const sized: ProducedEntry[] = order.producedPallets.map((p, i) => ({
        value:
          (p?.value ?? 0) * (order.sheetsPerPallet?.[i]?.value ?? 0),
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

  const rawStart = resolveStartDate(settings, now);
  const startAt = skipWeekendForward(rawStart);
  let cursor = startAt;
  const rows: ScheduledOrder[] = [];
  let totalProductionMinutes = 0;
  let totalGapMinutes = 0;
  const totalPackages: number | undefined = undefined;
  let lastSpeed: number | undefined;
  let lastPerPackage: number | undefined;

  orders.forEach((order, idx) => {
    const speedMPerMin = resolveSpeed(order, lastSpeed);
    lastSpeed = speedMPerMin;
    const totalLengthM = calculateOrderLengthM(order);
    const productionMinutes = totalLengthM / speedMPerMin;

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

    if (mode === 'profiles') {
      const perPackage =
        order.profilesPerPackage && order.profilesPerPackage > 0
          ? order.profilesPerPackage
          : lastPerPackage;

      totalProfiles = calculateTotalProfiles(order);

      if (perPackage && perPackage > 0) {
        lastPerPackage = perPackage;
        if (totalProfiles !== undefined) {
          packages = Math.ceil(totalProfiles / perPackage);
        }
      }

      const produced = calculateProducedProfiles(order, perPackage);
      if (produced) {
        totalProfiles = produced.totalProfiles ?? totalProfiles;
        producedProfiles = produced.producedProfiles;
        producedPackages = produced.producedPackages;
        remainingProfiles = produced.remainingProfiles;
        remainingPackages = produced.remainingPackages;
        fraction = produced.fraction;
      }
    } else {
      const produced = calculateProducedSheets(order);
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
    const start = skipWeekendForward(cursor);
    const end = addWorkingMinutes(start, remainingMinutes);

    rows.push({
      order,
      speedMPerMin,
      totalLengthM,
      productionMinutes,
      remainingMinutes,
      start,
      end,
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
    });

    totalProductionMinutes += remainingMinutes;
    totalGapMinutes += gapAfterMin;
    cursor = addWorkingMinutes(end, gapAfterMin);
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
