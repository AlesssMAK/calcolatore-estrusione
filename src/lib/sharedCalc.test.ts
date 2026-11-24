import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { rpc } }));

// The list cache lives in the module: a fresh copy for each test.
async function load() {
  vi.resetModules();
  return (await import('./sharedCalc')).loadCompanyCalcs;
}

const payload = (label: string) => ({
  v: 1,
  mode: 'sheets',
  label,
  values: { settings: { startAt: '2026-05-11T06:00:00.000Z' }, orders: [] },
  result: { rows: [{ start: '2026-05-11T06:00:00.000Z' }] },
});
const row = (id: string, version: number, label: string | null) => ({
  id,
  payload: label === null ? null : payload(label),
  version,
  updated_at: '2026-05-11T06:00:00Z',
  is_editable: false,
});
const answer = (data: unknown, error: unknown = null) => ({ data, error });
/** What the app said it already has, call by call. */
const knownSent = () =>
  rpc.mock.calls
    .filter(([fn]) => fn === 'get_company_calcs_delta')
    .map(([, args]) => (args as { p_known: unknown }).p_known);

describe('loadCompanyCalcs — only what changed comes back', () => {
  beforeEach(() => rpc.mockReset());

  it('says what it has, and fills in the unchanged ones itself', async () => {
    const loadCompanyCalcs = await load();
    rpc.mockResolvedValueOnce(answer([row('a', 1, 'A'), row('b', 4, 'B')]));
    const first = await loadCompanyCalcs('acme');
    expect(first?.map(c => [c.id, c.version, c.payload.label])).toEqual([
      ['a', 1, 'A'],
      ['b', 4, 'B'],
    ]);

    // «a» unchanged (no payload), «b» edited, «c» new.
    rpc.mockResolvedValueOnce(
      answer([row('a', 1, null), row('b', 5, 'B2'), row('c', 1, 'C')])
    );
    const second = await loadCompanyCalcs('acme');
    expect(knownSent()).toEqual([{}, { a: 1, b: 4 }]);
    expect(second?.map(c => [c.id, c.version, c.payload.label])).toEqual([
      ['a', 1, 'A'],
      ['b', 5, 'B2'],
      ['c', 1, 'C'],
    ]);
    // Revived like a full read: dates as Date, the form's startAt as text.
    const a = second![0].payload;
    expect(
      (a.result as unknown as { rows: { start: unknown }[] }).rows[0].start
    ).toBeInstanceOf(Date);
    expect(a.values.settings.startAt).toBe('2026-05-11T06:00:00.000Z');
  });

  it('a calc taken off the list is forgotten', async () => {
    const loadCompanyCalcs = await load();
    rpc.mockResolvedValueOnce(answer([row('a', 1, 'A'), row('b', 1, 'B')]));
    await loadCompanyCalcs('acme');
    rpc.mockResolvedValueOnce(answer([row('b', 1, null)]));
    expect((await loadCompanyCalcs('acme'))?.map(c => c.id)).toEqual(['b']);
    rpc.mockResolvedValueOnce(answer([]));
    await loadCompanyCalcs('acme');
    expect(knownSent()[2]).toEqual({ b: 1 });
  });

  it('every read hands out its own copies', async () => {
    const loadCompanyCalcs = await load();
    rpc.mockResolvedValueOnce(answer([row('a', 1, 'A')]));
    const first = await loadCompanyCalcs('acme');
    first![0].payload.label = 'changed here';
    rpc.mockResolvedValueOnce(answer([row('a', 1, null)]));
    expect((await loadCompanyCalcs('acme'))![0].payload.label).toBe('A');
  });

  it('each company its own list', async () => {
    const loadCompanyCalcs = await load();
    rpc.mockResolvedValueOnce(answer([row('a', 2, 'A')]));
    await loadCompanyCalcs('acme');
    rpc.mockResolvedValueOnce(answer([]));
    await loadCompanyCalcs('other');
    expect(knownSent()).toEqual([{}, {}]);
  });

  it('offline: null, and what it had is kept for the next read', async () => {
    const loadCompanyCalcs = await load();
    rpc.mockResolvedValueOnce(answer([row('a', 1, 'A')]));
    await loadCompanyCalcs('acme');
    rpc.mockResolvedValueOnce(
      answer(null, { code: '', message: 'Failed to fetch' })
    );
    expect(await loadCompanyCalcs('acme')).toBeNull();
    rpc.mockResolvedValueOnce(answer([row('a', 1, null)]));
    expect((await loadCompanyCalcs('acme'))![0].payload.label).toBe('A');
    expect(knownSent()[2]).toEqual({ a: 1 });
  });

  it('a database without the new function: the whole list, as before', async () => {
    const loadCompanyCalcs = await load();
    rpc
      .mockResolvedValueOnce(
        answer(null, { code: 'PGRST202', message: 'not found' })
      )
      .mockResolvedValueOnce(answer([row('a', 1, 'A')]));
    expect((await loadCompanyCalcs('acme'))?.map(c => c.id)).toEqual(['a']);
    rpc.mockResolvedValueOnce(answer([row('a', 1, 'A')]));
    await loadCompanyCalcs('acme');
    // Asked once; from then on straight to the old one.
    expect(rpc.mock.calls.map(([fn]) => fn)).toEqual([
      'get_company_calcs_delta',
      'get_company_calcs',
      'get_company_calcs',
    ]);
  });
});
