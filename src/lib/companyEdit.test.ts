import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyCalc, SharedPayload } from './sharedCalc';

const server = vi.hoisted(() => ({
  owner: vi.fn(),
  member: vi.fn(),
}));
vi.mock('./sharedCalc', () => ({
  updateSharedCalc: server.owner,
  updateCompanyCalc: server.member,
}));

import { currentSchedule, editableCompanyIds, saveCompanyPatch } from './companyEdit';
import { loadHistory, saveCalculation, updateSyncMeta, type SyncMeta } from './calcHistory';
import { calculateSchedule } from '../utils/calculator';
import type { TrackingPatch } from '../utils/advance';
import type { FormValues } from '../formSchema';
import type { WeekSchedule } from '../types';

const start = new Date(2026, 4, 11, 6);
function payload(speed: number): SharedPayload {
  const values = {
    settings: { startMode: 'manual', startAt: start.toISOString(), gapMode: 'continuous' },
    orders: [{ id: 'a', speedMPerMin: speed, sizes: [{ uid: 'a1', sheets: 60, length: 1000 }] }],
  } as unknown as FormValues;
  return {
    v: 1,
    mode: 'sheets',
    values,
    label: 'calc',
    result: calculateSchedule(values.settings, values.orders, { now: start }),
  };
}

const row = (isEditable = false): CompanyCalc => ({
  id: 'p1',
  payload: payload(1),
  version: 2,
  updatedAt: null,
  isEditable,
});

/** This device's copy of row "p1". */
function local(sync: Omit<SyncMeta, 'id' | 'version'>) {
  const p = payload(1);
  const e = saveCalculation(p.result, p.values, undefined, 'calc');
  updateSyncMeta(e.id, { id: 'p1', version: 2, ...sync });
  return e.id;
}
const entry = (id: string) => loadHistory().find((e) => e.id === id)!;

const patch = (): TrackingPatch => {
  const { values, result } = payload(2);
  return { values, result, completedRows: [], snapshot: undefined };
};

describe('changing a published calc outside the form', () => {
  beforeEach(() => {
    localStorage.clear();
    server.owner.mockReset().mockResolvedValue(3);
    server.member.mockReset().mockResolvedValue(3);
  });

  it('the author writes with the token; the original only notes the new version', async () => {
    const id = local({ token: 't', published: true });
    const saved = await saveCompanyPatch(row(), patch(), 5);
    expect(server.owner).toHaveBeenCalledWith('p1', 't', expect.anything());
    expect(server.member).not.toHaveBeenCalled();
    expect(saved?.calc.version).toBe(3);
    expect(saved?.calc.payload.label).toBe('calc');
    expect(saved?.copy).toBeUndefined();
    const e = entry(id);
    expect(e.production?.version).toBe(3);
    expect(e.values?.orders[0]?.speedMPerMin).toBe(1); // the original stays
    expect(e.sync?.version).toBe(2);
  });

  it('a member of an editable calc writes without a token; its copy follows', async () => {
    const id = local({ companyEditable: true });
    const saved = await saveCompanyPatch(row(true), patch(), 5);
    expect(server.member).toHaveBeenCalledWith('p1', expect.anything());
    expect(saved?.copy?.id).toBe(id);
    const e = entry(id);
    expect(e.values?.orders[0]?.speedMPerMin).toBe(2);
    expect(e.sync?.version).toBe(3);
  });

  it('no copy on this device: just the shared document', async () => {
    const saved = await saveCompanyPatch(row(true), patch(), 5);
    expect(saved?.calc.version).toBe(3);
    expect(saved?.copy).toBeUndefined();
    expect(loadHistory()).toEqual([]);
  });

  it('a view-only calc is not written', async () => {
    expect(await saveCompanyPatch(row(), patch(), 5)).toBeNull();
    expect(server.owner).not.toHaveBeenCalled();
    expect(server.member).not.toHaveBeenCalled();
  });

  it('refused by the server: nothing changes here', async () => {
    server.member.mockResolvedValue(null);
    const id = local({ companyEditable: true });
    expect(await saveCompanyPatch(row(true), patch(), 5)).toBeNull();
    expect(entry(id).values?.orders[0]?.speedMPerMin).toBe(1);
    expect(entry(id).sync?.version).toBe(2);
  });

  it('may be changed here: own calcs and those editable by anyone', () => {
    local({ token: 't' });
    const own = row();
    const open = { ...row(true), id: 'p2' };
    const viewOnly = { ...row(), id: 'p3' };
    expect([...editableCompanyIds([own, open, viewOnly], 5)]).toEqual(['p1', 'p2']);
  });
});

describe('the schedule a calc is worked on now', () => {
  const schedule = {} as WeekSchedule;
  const calc = {
    values: { settings: { warmupMinutes: 5, shutdownMinutes: 6, noLimits: true } } as FormValues,
    snapshot: { schedule, warmupMinutes: 1, shutdownMinutes: 2 },
  };

  it('a company link: its schedule and buffers', () => {
    const other = {} as WeekSchedule;
    const s = currentSchedule(calc, { schedule: other, warmupMinutes: 10, shutdownMinutes: 20 });
    expect(s.schedule).toBe(other);
    expect(s).toMatchObject({ warmupMinutes: 10, shutdownMinutes: 20, noLimits: true });
  });

  it('no company: the calc\'s own', () => {
    const s = currentSchedule(calc, null);
    expect(s.schedule).toBe(schedule);
    expect(s).toMatchObject({ warmupMinutes: 5, shutdownMinutes: 6 });
  });
});
