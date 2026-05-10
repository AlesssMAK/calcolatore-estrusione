import type {
  CalculatorMode,
  GlobalSettings,
  Order,
  ProducedEntry,
  ScheduleResult,
  ScheduledOrder,
  ScheduledSizeDetail,
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
  const profilesEntered = sumEntries(order.producedProfiles);
  const packagesEntered = sumEntries(order.producedPackages);

  // Effective produced profiles per row: prefer producedProfiles[i], else
  // producedPackages[i] × perPackages[i].
  const sizesLen = order.sizes?.length ?? 0;
  const rowsLen = Math.max(
    sizesLen,
    order.producedProfiles?.length ?? 0,
    order.producedPackages?.length ?? 0,
  );
  const effectiveProfiles: number[] = [];
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
    // Per-batch packages from producedProfiles[i] / perPackages[i] (best-effort).
    for (let i = 0; i < effectiveProfiles.length; i++) {
      const pp = perPackages[i];
      if (pp && pp > 0) {
        producedPackagesCount += Math.ceil(effectiveProfiles[i] / pp);
      }
    }
  }

  const remainingProfiles =
    totalProfiles !== undefined ? Math.max(0, totalProfiles - cappedProduced) : 0;
  const remainingPackages =
    totalPackages !== undefined
      ? Math.max(0, totalPackages - producedPackagesCount)
      : 0;

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
  let lastSheetsPerPallet: number | undefined;

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
    const perPackagesForOrder: (number | undefined)[] = [];

    if (mode === 'profiles') {
      // Resolve per-size profilesPerPackage with inline + cross-order
      // inheritance. lastPerPackage carries over from earlier orders too.
      const sizes = order.sizes ?? [];
      for (let i = 0; i < sizes.length; i++) {
        const own = sizes[i]?.profilesPerPackage;
        const eff = own && own > 0 ? own : lastPerPackage;
        perPackagesForOrder[i] = eff;
        if (eff && eff > 0) lastPerPackage = eff;
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
        const minsI = speedMPerMin > 0 ? metersI / speedMPerMin : 0;
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
          const profI = order.producedProfiles?.[i]?.value ?? 0;
          const packI = order.producedPackages?.[i]?.value ?? 0;
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
          const sheetsEnt = order.producedSheets?.[i]?.value ?? 0;
          const perPalletEnt = order.sheetsPerPallet?.[i]?.value ?? 0;
          const palletsEnt = order.producedPallets?.[i]?.value ?? 0;
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
        const startI = skipWeekendForward(sizeCursor);
        const endI = addWorkingMinutes(startI, remainingMinsI);

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
          start: startI,
          end: endI,
        });
        sizeCursor = endI;
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
