import { beforeEach, describe, expect, it } from 'vitest';
import {
  isOriginal,
  loadHistory,
  restoreBeforeProduction,
  saveCalculation,
  updateBeforeProduction,
  updateProduction,
  updateSyncMeta,
} from './calcHistory';
import { calculateSchedule } from '../utils/calculator';
import type { FormValues } from '../formSchema';
import type { SharedPayload } from './sharedCalc';

const start = new Date(2026, 9, 12, 8);
const values = {
  settings: { startMode: 'manual', startAt: start.toISOString(), gapMode: 'continuous' },
  orders: [{ id: 'a', sheets: 60, sheetLengthMm: 1000, speedMPerMin: 1 }],
} as unknown as FormValues;
const result = calculateSchedule(values.settings, values.orders, { now: start });
const payload: SharedPayload = { v: 1, mode: 'sheets', values, result };

describe('an original published to Produzione', () => {
  beforeEach(() => localStorage.clear());

  it('keeps its Produzione binding and snapshot when it is saved again', () => {
    const saved = saveCalculation(result, values, undefined, 'calc');
    updateSyncMeta(saved.id, { id: 'p1', token: 't', version: 3, published: true });
    updateProduction(saved.id, { version: 4, payload, seenAt: 1 });
    // "Calcola" on the original re-saves the same slot.
    saveCalculation(result, values, undefined, 'calc', 10, 5, saved.id);
    const [entry] = loadHistory();
    expect(entry!.sync).toMatchObject({ id: 'p1', token: 't', version: 3 });
    expect(entry!.production?.version).toBe(4);
    // The snapshot's start comes back as the form keeps it (a plain string).
    expect(typeof entry!.production?.payload.values.settings.startAt).toBe('string');
  });

  it('a new entry starts unbound', () => {
    const saved = saveCalculation(result, values, undefined, 'calc');
    expect(saved.sync).toBeUndefined();
    expect(saved.production).toBeUndefined();
  });

  it('goes back to its own version from before changes taken from Produzione', () => {
    const saved = saveCalculation(result, values, undefined, 'mine');
    updateSyncMeta(saved.id, { id: 'p1', token: 't', version: 3, published: true });
    updateProduction(saved.id, { version: 4, payload, seenAt: 1 });
    const own = { label: saved.label, result: saved.result, values: saved.values };
    // "Usa Produzione" saves Produzione's version over the slot…
    const prodValues = { ...values, orders: [{ ...values.orders[0], sheets: 90 }] };
    saveCalculation(result, prodValues, undefined, 'theirs', 10, 5, saved.id);
    updateBeforeProduction(saved.id, own);
    expect(loadHistory()[0]!.beforeProduction?.values?.orders[0]?.sheets).toBe(60);
    // (the kept start comes back as the form keeps it — a plain string)
    expect(typeof loadHistory()[0]!.beforeProduction?.values?.settings.startAt).toBe('string');

    const back = restoreBeforeProduction(saved.id)!;
    expect(back.label).toBe('mine');
    expect(back.values?.orders[0]?.sheets).toBe(60);
    const [entry] = loadHistory();
    expect(entry!.values?.orders[0]?.sheets).toBe(60);
    expect(entry!.beforeProduction).toBeUndefined();
    expect(entry!.sync?.token).toBe('t');
    expect(entry!.production?.version).toBe(4);
    // Nothing more to go back to.
    expect(restoreBeforeProduction(saved.id)).toBeNull();
  });

  it('"Calcola" saves over the kept version — it’s gone', () => {
    const saved = saveCalculation(result, values, undefined, 'calc');
    updateBeforeProduction(saved.id, { label: 'old', result, values });
    saveCalculation(result, values, undefined, 'calc', 10, 5, saved.id);
    expect(loadHistory()[0]!.beforeProduction).toBeUndefined();
  });

  it('is the author’s copy — not the live version, not a member’s', () => {
    expect(isOriginal({ id: 'p1', token: 't', version: 1 })).toBe(true);
    expect(isOriginal({ id: 'p1', token: 't', version: 1, live: true })).toBe(false);
    expect(isOriginal({ id: 'p1', version: 1, companyEditable: true })).toBe(false);
    expect(isOriginal(null)).toBe(false);
  });
});
