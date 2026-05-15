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

export interface GlobalSettings {
  startMode: StartMode;
  startAt?: string;
  gapMode: GapMode;
  productName?: string;
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
  sizeDetails?: ScheduledSizeDetail[];
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
