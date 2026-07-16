import type { FormValues } from '../formSchema';
import type { CalculatorMode, WeekendDay, WeekendWork } from '../types';

export const genId = () => Math.random().toString(36).slice(2, 10);

// Weekend shift is a machine setting, not per-calculation — persist it so it
// survives reloads and form resets.
const WEEKEND_KEY = 'calc.weekend';
const defaultDay = (enabled: boolean): WeekendDay => ({
  enabled,
  full24: false,
  start: 6,
  end: 14,
});
const DEFAULT_WEEKEND = (): WeekendWork => ({
  enabled: false,
  sat: defaultDay(true),
  sun: defaultDay(false),
});

function parseDay(raw: unknown, enabledDefault: boolean): WeekendDay {
  const p = (raw ?? {}) as Partial<WeekendDay>;
  const half = (v: unknown, d: number) =>
    Number.isFinite(v) ? Math.min(24, Math.max(0, Math.round(Number(v) * 2) / 2)) : d;
  return {
    enabled: typeof p.enabled === 'boolean' ? p.enabled : enabledDefault,
    full24: !!p.full24,
    start: half(p.start, 6),
    end: half(p.end, 14),
  };
}

export function loadWeekendPref(): WeekendWork {
  try {
    const raw =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(WEEKEND_KEY)
        : null;
    if (!raw) return DEFAULT_WEEKEND();
    const p = JSON.parse(raw) as Partial<WeekendWork>;
    return {
      enabled: !!p.enabled,
      sat: parseDay(p.sat, true),
      sun: parseDay(p.sun, false),
    };
  } catch {
    return DEFAULT_WEEKEND();
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
