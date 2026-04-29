import { addMinutes } from 'date-fns';
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
  settings: GlobalSettings,
  order: Order,
  fallback: number | undefined,
): number {
  if (settings.speedMode === 'global') {
    if (!settings.globalSpeed || settings.globalSpeed <= 0) {
      throw new Error('globalSpeed required in "global" mode');
    }
    return settings.globalSpeed;
  }
  const candidate =
    order.speedMPerMin && order.speedMPerMin > 0
      ? order.speedMPerMin
      : fallback;
  if (!candidate || candidate <= 0) {
    throw new Error('speedMPerMin required in "perOrder" mode');
  }
  return candidate;
}

export interface ProducedProfilesResult {
  totalProfiles: number;
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
  perPackage: number,
): ProducedProfilesResult | undefined {
  if (order.useTotalLength) return undefined;
  const total = calculateTotalProfiles(order);
  if (total === undefined || total <= 0) return undefined;

  const profilesEntered = sumEntries(order.producedProfiles);
  const packagesEntered = sumEntries(order.producedPackages);

  let producedProfiles = 0;
  if (profilesEntered > 0) {
    producedProfiles = profilesEntered;
  } else if (packagesEntered > 0) {
    producedProfiles = packagesEntered * perPackage;
  }

  const cappedProduced = Math.min(producedProfiles, total);
  const producedPackages = Math.ceil(cappedProduced / perPackage);
  const totalPackages = Math.ceil(total / perPackage);
  const fraction = total > 0 ? cappedProduced / total : 0;

  return {
    totalProfiles: total,
    producedProfiles: cappedProduced,
    producedPackages,
    remainingProfiles: Math.max(0, total - cappedProduced),
    remainingPackages: Math.max(0, totalPackages - producedPackages),
    fraction,
  };
}

export function calculateProducedSheets(
  order: Order,
): ProducedSheetsResult | undefined {
  const totalSheets = order.useTotalLength
    ? undefined
    : calculateTotalProfiles(order);

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

  const cappedProduced = totalSheets
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

  const fraction =
    totalSheets && totalSheets > 0 ? cappedProduced / totalSheets : 0;

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

  const startAt = resolveStartDate(settings, now);
  let cursor = startAt;
  const rows: ScheduledOrder[] = [];
  let totalProductionMinutes = 0;
  let totalGapMinutes = 0;
  let totalPackages: number | undefined = mode === 'profiles' ? 0 : undefined;
  let lastSpeed: number | undefined;
  let lastPerPackage: number | undefined;

  orders.forEach((order, idx) => {
    const speedMPerMin = resolveSpeed(settings, order, lastSpeed);
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
      if (!perPackage || perPackage <= 0) {
        throw new Error('profilesPerPackage required in profiles mode');
      }
      lastPerPackage = perPackage;

      totalProfiles = calculateTotalProfiles(order);
      if (totalProfiles !== undefined) {
        packages = Math.ceil(totalProfiles / perPackage);
        totalPackages = (totalPackages ?? 0) + packages;
      }

      const produced = calculateProducedProfiles(order, perPackage);
      if (produced) {
        producedProfiles = produced.producedProfiles;
        producedPackages = produced.producedPackages;
        remainingProfiles = produced.remainingProfiles;
        remainingPackages = produced.remainingPackages;
        fraction = produced.fraction;
      }
    } else {
      const produced = calculateProducedSheets(order);
      if (produced) {
        totalSheets = produced.totalSheets;
        producedSheetsCount = produced.producedSheets;
        producedPallets = produced.producedPallets;
        sheetsPerPalletVal = produced.sheetsPerPallet;
        remainingSheets = produced.remainingSheets;
        remainingPallets = produced.remainingPallets;
        fraction = produced.fraction;
      }
    }

    const remainingMinutes = productionMinutes * Math.max(0, 1 - fraction);
    const start = cursor;
    const end = addMinutes(start, remainingMinutes);

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
    cursor = addMinutes(end, gapAfterMin);
  });

  const endAt = rows[rows.length - 1]!.end;

  return {
    rows,
    startAt,
    endAt,
    totalProductionMinutes,
    totalGapMinutes,
    totalDurationMinutes: (endAt.getTime() - startAt.getTime()) / 60_000,
    totalPackages,
    mode,
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
