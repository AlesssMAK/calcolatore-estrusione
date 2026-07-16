import type { FormValues } from '../formSchema';
import type { CalculatorMode, WeekendWork } from '../types';

export const genId = () => Math.random().toString(36).slice(2, 10);

// Weekend shift is a machine setting, not per-calculation — persist it so it
// survives reloads and form resets.
const WEEKEND_KEY = 'calc.weekend';
const DEFAULT_WEEKEND: WeekendWork = {
  enabled: false,
  sat: true,
  sun: false,
  startHour: 6,
  endHour: 14,
};

export function loadWeekendPref(): WeekendWork {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(WEEKEND_KEY)
        : null;
    if (!raw) return { ...DEFAULT_WEEKEND };
    const p = JSON.parse(raw) as Partial<WeekendWork>;
    return {
      enabled: !!p.enabled,
      sat: p.sat !== false,
      sun: !!p.sun,
      startHour: Number.isFinite(p.startHour) ? Number(p.startHour) : 6,
      endHour: Number.isFinite(p.endHour) ? Number(p.endHour) : 14,
    };
  } catch {
    return { ...DEFAULT_WEEKEND };
  }
}

export function saveWeekendPref(w: WeekendWork): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WEEKEND_KEY, JSON.stringify(w));
    }
  } catch {
    /* best-effort; storage may be unavailable */
  }
}

export function makeEmptySize(): NonNullable<
  FormValues['orders'][number]['sizes']
>[number] {
  return {
    sheets: undefined,
    length: undefined,
    profilesPerPackage: undefined,
  } as unknown as NonNullable<FormValues['orders'][number]['sizes']>[number];
}

const emptyProducedEntry = (): { value?: number } => ({ value: undefined });

export function makeEmptyOrder(
  mode: CalculatorMode = 'sheets',
  inheritUseTotalLength = false,
  inheritProductName = '',
): FormValues['orders'][number] {
  const base = {
    id: genId(),
    productName: inheritProductName,
    useTotalLength: inheritUseTotalLength,
    totalLengthM: undefined,
    sizes: [makeEmptySize()],
    speedMPerMin: undefined,
    gapAfterMin: undefined,
  };
  if (mode === 'profiles') {
    return {
      ...base,
      producedProfiles: [emptyProducedEntry()],
      producedPackages: [emptyProducedEntry()],
      producedItemLength: undefined,
    } as unknown as FormValues['orders'][number];
  }
  return {
    ...base,
    producedSheets: [emptyProducedEntry()],
    sheetsPerPallet: [emptyProducedEntry()],
    producedPallets: [emptyProducedEntry()],
    producedItemLength: undefined,
  } as unknown as FormValues['orders'][number];
}

export function buildEmptyDefaults(
  mode: CalculatorMode = 'sheets',
): FormValues {
  return {
    settings: {
      startMode: 'now',
      startAt: '',
      gapMode: 'continuous',
      productName: '',
      weekend: loadWeekendPref(),
    },
    orders: [makeEmptyOrder(mode)],
  } as unknown as FormValues;
}
