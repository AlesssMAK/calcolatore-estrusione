import type { FormValues } from '../formSchema';

export const genId = () => Math.random().toString(36).slice(2, 10);

export function makeEmptyOrder(): FormValues['orders'][number] {
  return {
    id: genId(),
    sheets: undefined,
    sheetLengthMm: undefined,
    speedMPerMin: undefined,
    gapAfterMin: undefined,
    profilesPerPackage: undefined,
  } as unknown as FormValues['orders'][number];
}

export function buildEmptyDefaults(): FormValues {
  return {
    settings: {
      startMode: 'now',
      startAt: '',
      speedMode: 'global',
      globalSpeed: undefined,
      gapMode: 'continuous',
    },
    orders: [makeEmptyOrder()],
  } as unknown as FormValues;
}
