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

export function makeEmptyOrder(
  mode: CalculatorMode = 'sheets',
): FormValues['orders'][number] {
  if (mode === 'sheets') {
    return {
      id: genId(),
      sizes: [makeEmptySize()],
      speedMPerMin: undefined,
      gapAfterMin: undefined,
    } as unknown as FormValues['orders'][number];
  }
  return {
    id: genId(),
    sheets: undefined,
    sheetLengthMm: undefined,
    speedMPerMin: undefined,
    gapAfterMin: undefined,
    profilesPerPackage: undefined,
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
