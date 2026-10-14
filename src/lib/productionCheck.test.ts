import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyCalc, SharedPayload } from './sharedCalc';

const list = vi.hoisted(() => ({ current: [] as CompanyCalc[] | null }));
vi.mock('./sharedCalc', () => ({
  loadCompanyCalcs: async () => list.current,
}));

import { checkProduction, productionStatus } from './productionCheck';
import { loadHistory, saveCalculation, updateSyncMeta } from './calcHistory';
import { calculateSchedule } from '../utils/calculator';
import type { FormValues } from '../formSchema';

const start = new Date(2026, 4, 11, 6);
function payload(speed: number): SharedPayload {
  const values = {
    settings: { startMode: 'manual', startAt: start.toISOString(), gapMode: 'continuous' },
    orders: [{ id: 'a', speedMPerMin: speed, sizes: [{ uid: 'a1', sheets: 60, length: 1000 }] }],
  } as unknown as FormValues;
  return { v: 1, mode: 'sheets', values, result: calculateSchedule(values.settings, values.orders, { now: start }) };
}

/** An original published to Produzione as row "p1" (seen at version 2). */
function original() {
  const p = payload(1);
  const e = saveCalculation(p.result, p.values, undefined, 'calc');
  updateSyncMeta(e.id, { id: 'p1', token: 't', version: 2, published: true });
  return e.id;
}
const entry = (id: string) => loadHistory().find((e) => e.id === id)!;
const row = (version: number, speed = 1): CompanyCalc => ({
  id: 'p1',
  payload: payload(speed),
  version,
  updatedAt: null,
  isEditable: false,
});

describe('checking the originals against Produzione', () => {
  beforeEach(() => localStorage.clear());

  it('takes a newer Produzione version as what the original is compared to', async () => {
    const id = original();
    list.current = [row(3, 2)];
    expect(await checkProduction('acme', 5)).toBe(true);
    expect(entry(id).production?.version).toBe(3);
    // The factory's speed differs from the original's → one plan difference.
    expect(productionStatus(entry(id))).toEqual({ gone: false, diffs: 1 });
    // Nothing new the second time.
    expect(await checkProduction('acme', 5)).toBe(false);
  });

  it('notes an original no longer in the list — and when it is back', async () => {
    const id = original();
    list.current = [];
    expect(await checkProduction('acme', 5)).toBe(true);
    expect(entry(id).sync?.gone).toBe(true);
    expect(productionStatus(entry(id))).toEqual({ gone: true });
    list.current = [row(2)];
    await checkProduction('acme', 5);
    expect(entry(id).sync?.gone).toBeUndefined();
  });

  it('concludes nothing when the list can’t be read', async () => {
    const id = original();
    list.current = null;
    expect(await checkProduction('acme', 5)).toBe(false);
    expect(entry(id).sync?.gone).toBeUndefined();
  });

  it('leaves alone what isn’t a published original', async () => {
    const p = payload(1);
    saveCalculation(p.result, p.values, undefined, 'plain');
    list.current = [];
    expect(await checkProduction('acme', 5)).toBe(false);
  });
});
