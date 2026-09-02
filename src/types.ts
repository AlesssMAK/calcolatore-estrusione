export type StartMode = 'now' | 'manual';
export type GapMode = 'continuous' | 'withGaps';
export type CalculatorMode = 'sheets' | 'profiles';

export interface OrderSize {
  sheets?: number;
  length?: number;
  profilesPerPackage?: number;
}

export interface ProducedEntry {
  value?: number;
  // Optional tag: which size this entry belongs to (sizes-mode only).
  // Lets a single size accumulate multiple partial-production entries
  // (e.g. day-by-day). When undefined the entry's position in the array
  // is used as the size index (backward compat).
  sizeIndex?: number;
}

export interface Order {
  id: string;
  productName?: string;
  useTotalLength?: boolean;
  totalLengthM?: number;
  sizes?: OrderSize[];
  sheets?: number;
  sheetLengthMm?: number;
  speedMPerMin?: number;
  /**
   * Number of cavities in the extrusion die (profiles-only). Acts as a
   * multiplier on the linear speed: with cavity=4 the line emits 4 profiles
   * simultaneously, so the order finishes 4× faster. Undefined / missing
   * is treated as 1 (no multiplier). Inherits across orders via lastCavity.
   */
  cavity?: number;
  gapAfterMin?: number;
  producedProfiles?: ProducedEntry[];
  producedPackages?: ProducedEntry[];
  producedSheets?: ProducedEntry[];
  sheetsPerPallet?: ProducedEntry[];
  producedPallets?: ProducedEntry[];
  producedItemLength?: ProducedEntry[];
  // useTotalLength mode only: per-batch profiles-per-package (parallel array
  // to producedProfiles / producedItemLength). Inherits within and across
  // orders. In sizes-mode the per-size value on OrderSize is used instead.
  profilesPerPackage?: ProducedEntry[];
}

export interface ProducedSummary {
  producedProfiles: number;
  producedPackages: number;
  producedFraction: number;
  source: 'profiles' | 'packages';
}

// One weekend day's shift: whether it is worked, and its window. `full24`
// overrides start/end and works the whole day. Hours are in 30-min steps
// (multiples of 0.5), 0–24.
export interface WeekendDay {
  enabled: boolean;
  full24: boolean;
  start: number;
  end: number;
}

// Optional weekend shift. Normally the line runs Mon 06:00 → Sat 06:00 and the
// whole weekend is skipped. When `enabled`, each picked weekend day gets its
// own window (or 24h) that the scheduler and the start-date picker honour.
export interface WeekendWork {
  enabled: boolean;
  sat: WeekendDay;
  sun: WeekendDay;
}

// Full 7-day working schedule (per-company, set in /admin). When present it is
// the source of truth for every day and overrides the Mon–Fri default.
export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type WeekSchedule = Record<WeekdayKey, WeekendDay>;

export interface GlobalSettings {
  startMode: StartMode;
  startAt?: string;
  gapMode: GapMode;
  productName?: string;
  weekend?: WeekendWork;
  /** Minutes of warm-up spent at the start of each working block (line goes
   *  cold during stops). Undefined → 0. */
  warmupMinutes?: number;
  /** Minutes reserved before the end of each working block for shutdown.
   *  Undefined → 0. */
  shutdownMinutes?: number;
}

/** A single continuous production window (used when an order is split across
 *  non-working gaps in the results). */
export interface Segment {
  start: Date;
  end: Date;
  /** Duration of this window, in minutes. */
  minutes: number;
  /** Meters produced in this window (minutes × effective speed). */
  metersM: number;
  /** Sheets/profiles produced in this window (proportional to time; undefined
   *  when the piece count is unknown, e.g. total-meters mode). */
  pieces?: number;
}

/** Snapshot of the effective working schedule + buffers used for a computation.
 *  Stored with a saved calculation so it can be advanced to "now" / recalculated
 *  later without depending on (possibly changed) company settings. */
export interface ScheduleSnapshot {
  weekend?: WeekendWork;
  schedule?: WeekSchedule | null;
  warmupMinutes: number;
  shutdownMinutes: number;
}

/** Per-order production progress as of a given instant — used to auto-advance
 *  and calibrate a saved calculation. Counts are cumulative (already-entered
 *  produced + what elapsed since the original start). */
export interface OrderProgress {
  orderId: string;
  /** True when this order is fully produced by the reference instant. */
  done: boolean;
  /** Cumulative pieces produced per size (single element for single-size
   *  orders). Undefined in total-meters mode. */
  producedCountPerSize?: number[];
  /** Cumulative meters produced (total-meters mode only). */
  producedLengthM?: number;
}

export interface ScheduleProgress {
  now: Date;
  orders: OrderProgress[];
}

export interface ScheduledSizeDetail {
  sheets: number;
  length: number;
  metersM: number;
  productionMinutes: number;
  remainingMinutes: number;
  perPackage?: number;
  packages?: number;
  // Profiles mode produced/remaining at this size:
  producedProfiles?: number;
  producedPackages?: number;
  remainingProfiles?: number;
  remainingPackages?: number;
  // Sheets mode produced/remaining at this size:
  sheetsPerPalletAtSize?: number;
  producedSheetsAtSize?: number;
  producedPalletsAtSize?: number;
  remainingSheetsAtSize?: number;
  remainingPalletsAtSize?: number;
  // Per-unit metrics (sheets/profiles per pallet/package).
  // Only set when the rate is known (sheetsPerPallet>0 or profilesPerPackage>0):
  //  - timePerUnitMin: minutes to produce one pallet/package at this size
  //  - totalUnits:    total pallets/packages for this size (ceil sheets/rate)
  timePerUnitMin?: number;
  totalUnits?: number;
  start: Date;
  end: Date;
}

export interface ScheduledOrder {
  order: Order;
  speedMPerMin: number;
  totalLengthM: number;
  productionMinutes: number;
  remainingMinutes: number;
  start: Date;
  end: Date;
  gapAfterMin: number;
  packages?: number;
  totalProfiles?: number;
  producedProfiles?: number;
  producedPackages?: number;
  remainingProfiles?: number;
  remainingPackages?: number;
  totalSheets?: number;
  producedSheets?: number;
  producedPallets?: number;
  remainingSheets?: number;
  remainingPallets?: number;
  sheetsPerPallet?: number;
  // useTotalLength mode: meters produced / remaining for the order. In
  // sizes-mode these are derived from totalLengthM × fraction and exposed
  // here too so the UI can show a unified "Metri prodotti / restanti" row.
  producedLengthM?: number;
  remainingLengthM?: number;
  // Per-unit (pallet / package) metrics, populated only for single-size
  // orders where the rate is known. Multi-size orders carry per-size
  // values inside `sizeDetails` instead.
  timePerUnitMin?: number;
  totalUnits?: number;
  sizeDetails?: ScheduledSizeDetail[];
  /** Production windows this order occupied. Length > 1 means a non-working
   *  gap (weekend / off-window) split it into parts. */
  segments?: Segment[];
}

export interface ScheduleResult {
  rows: ScheduledOrder[];
  startAt: Date;
  endAt: Date;
  totalProductionMinutes: number;
  totalGapMinutes: number;
  totalDurationMinutes: number;
  totalPackages?: number;
  mode: CalculatorMode;
  productName?: string;
}
