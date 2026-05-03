export type StartMode = 'now' | 'manual';
export type SpeedMode = 'global' | 'perOrder';
export type GapMode = 'continuous' | 'withGaps';
export type CalculatorMode = 'sheets' | 'profiles';

export interface OrderSize {
  sheets?: number;
  length?: number;
}

export interface ProducedEntry {
  value?: number;
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
  profilesPerPackage?: number;
  producedProfiles?: ProducedEntry[];
  producedPackages?: ProducedEntry[];
  producedSheets?: ProducedEntry[];
  sheetsPerPallet?: ProducedEntry[];
  producedPallets?: ProducedEntry[];
  producedItemLength?: number;
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
  speedMode: SpeedMode;
  globalSpeed?: number;
  gapMode: GapMode;
  productName?: string;
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
