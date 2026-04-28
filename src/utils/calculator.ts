import { addMinutes } from 'date-fns';
import type {
  CalculatorMode,
  GlobalSettings,
  Order,
  ScheduleResult,
  ScheduledOrder,
} from '../types';

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

    const start = cursor;
    const end = addMinutes(start, productionMinutes);

    const isLast = idx === orders.length - 1;
    const gapAfterMin =
      !isLast && settings.gapMode === 'withGaps'
        ? Math.max(0, order.gapAfterMin ?? 0)
        : 0;

    let packages: number | undefined;
    if (mode === 'profiles') {
      const perPackage =
        order.profilesPerPackage && order.profilesPerPackage > 0
          ? order.profilesPerPackage
          : lastPerPackage;
      if (!perPackage || perPackage <= 0) {
        throw new Error('profilesPerPackage required in profiles mode');
      }
      lastPerPackage = perPackage;

      const totalProfiles = calculateTotalProfiles(order);
      if (totalProfiles !== undefined) {
        packages = Math.ceil(totalProfiles / perPackage);
        totalPackages = (totalPackages ?? 0) + packages;
      }
    }

    rows.push({
      order,
      speedMPerMin,
      totalLengthM,
      productionMinutes,
      start,
      end,
      gapAfterMin,
      packages,
    });

    totalProductionMinutes += productionMinutes;
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
