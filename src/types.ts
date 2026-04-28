export type StartMode = 'now' | 'manual';
export type SpeedMode = 'global' | 'perOrder';
export type GapMode = 'continuous' | 'withGaps';
export type CalculatorMode = 'sheets' | 'profiles';

export interface OrderSize {
  sheets: number;
  length: number;
}

export interface Order {
  id: string;
  sizes?: OrderSize[];
  sheets?: number;
  sheetLengthMm?: number;
  speedMPerMin?: number;
  gapAfterMin?: number;
  profilesPerPackage?: number;
}

export interface GlobalSettings {
  startMode: StartMode;
  startAt?: string;
  speedMode: SpeedMode;
  globalSpeed?: number;
  gapMode: GapMode;
}

export interface ScheduledOrder {
  order: Order;
  speedMPerMin: number;
  totalLengthM: number;
  productionMinutes: number;
  start: Date;
  end: Date;
  gapAfterMin: number;
  packages?: number;
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
}
