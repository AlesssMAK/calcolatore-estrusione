import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';

export const genId = () => Math.random().toString(36).slice(2, 10);

export function makeEmptySize(): NonNullable<
  FormValues['orders'][number]['sizes']
>[number] {
  return {
    sheets: undefined,
    length: undefined,
  } as unknown as NonNullable<FormValues['orders'][number]['sizes']>[number];
}

const emptyProducedEntry = (): { value?: number } => ({ value: undefined });

export function makeEmptyOrder(
  mode: CalculatorMode = 'sheets',
  inheritUseTotalLength = false,
): FormValues['orders'][number] {
  const base = {
    id: genId(),
    useTotalLength: inheritUseTotalLength,
    totalLengthM: undefined,
    sizes: [makeEmptySize()],
    speedMPerMin: undefined,
    gapAfterMin: undefined,
  };
  if (mode === 'profiles') {
    return {
      ...base,
      profilesPerPackage: undefined,
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
      speedMode: 'global',
      globalSpeed: undefined,
      gapMode: 'continuous',
    },
    orders: [makeEmptyOrder(mode)],
  } as unknown as FormValues;
}
