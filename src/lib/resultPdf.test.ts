import { describe, expect, it } from 'vitest';
import { calculateSchedule } from '../utils/calculator';
import { buildResultPdfBlob, hasProgress } from './resultPdf';
import type { GlobalSettings, Order } from '../types';

const settings = {
  startMode: 'manual',
  startAt: new Date(2026, 9, 12, 8).toISOString(),
  gapMode: 'continuous',
  noLimits: true,
} as GlobalSettings;
const schedule = (orders: Order[]) =>
  calculateSchedule(settings, orders, {
    mode: 'sheets',
    schedule: null,
    warmupMinutes: 0,
    shutdownMinutes: 0,
    now: new Date(2026, 9, 12, 8),
  });

const fresh: Order[] = [
  {
    id: 'o1',
    productName: 'PC 10',
    speedMPerMin: 1,
    sizes: [
      { sheets: 60, length: 1000 },
      { sheets: 30, length: 2000 },
    ],
  },
  { id: 'o2', productName: 'PC 20', speedMPerMin: 1, sheets: 10, sheetLengthMm: 1000 },
];
// #1: its first size (1000 mm) made, the second one 10 of 30 along.
const along: Order[] = [
  {
    ...fresh[0],
    producedSheets: [
      { value: 60, sizeIndex: 0 },
      { value: 10, sizeIndex: 1 },
    ],
  },
  fresh[1],
];

const t = (key: string) => key;
const pdfText = async (orders: Order[], remainingOnly: boolean) => {
  const blob = await buildResultPdfBlob(schedule(orders), {
    mode: 'sheets',
    lang: 'it',
    units: { day: 'g', hour: 'h', minute: 'min' },
    t,
    remainingOnly,
  });
  return new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(blob);
  });
};

describe('result PDF', () => {
  it('has something already made only once production entered', () => {
    expect(hasProgress(schedule(fresh))).toBe(false);
    expect(hasProgress(schedule(along))).toBe(true);
  });

  it('only what is left: finished sizes left out, the rest with what remains', async () => {
    const all = await pdfText(along, false);
    expect(all).toContain('#1.1');
    expect(all).not.toContain('results.pdfRemaining');

    const left = await pdfText(along, true);
    expect(left).toContain('results.pdfRemaining');
    expect(left).not.toContain('#1.1'); // 1000 mm done
    expect(left).toContain('#1.2');
    expect(left).toContain('10 / 30'); // produced of the size
    expect(left).toContain('#2');
  });
});

describe('result PDF, order number', () => {
  it('goes next to the #N', async () => {
    const text = await pdfText([{ ...fresh[0], orderNumber: ' ORD-77 ' }, fresh[1]], false);
    expect(text).toContain('orders.orderNumberShort ORD-77');
  });

  it('adds nothing when the order has none', async () => {
    expect(await pdfText(fresh, false)).not.toContain('orders.orderNumberShort');
  });
});
