import { describe, expect, it } from 'vitest';
import { diffCalcs, planDiffCount, type CalcVersion } from './calcDiff';
import { buildAdvancedCalc } from './advance';
import { calculateSchedule } from './calculator';
import type { FormValues } from '../formSchema';
import type { Order, ScheduleSnapshot } from '../types';

const at = (h: number, m = 0) => new Date(2026, 4, 11, h, m); // Mon
const snapshot: ScheduleSnapshot = { warmupMinutes: 0, shutdownMinutes: 0, schedule: null };

type OrderIn = Partial<Order> & { id: string };

function version(orders: OrderIn[], settings: Partial<FormValues['settings']> = {}): CalcVersion {
  const values = {
    settings: {
      startMode: 'manual',
      startAt: at(6).toISOString(),
      gapMode: 'continuous',
      ...settings,
    },
    orders,
  } as unknown as FormValues;
  const result = calculateSchedule(values.settings, values.orders, { now: at(6) });
  return { values, result, snapshot };
}

// Two orders at 1 m/min: "a" 60 × 1000 mm + 30 × 2000 mm (06–08), "b" inherits
// the speed: 60 × 1000 mm (08–09).
const base = (): OrderIn[] => [
  {
    id: 'a',
    productName: 'PC 10',
    speedMPerMin: 1,
    sizes: [
      { uid: 'a1', sheets: 60, length: 1000 },
      { uid: 'a2', sheets: 30, length: 2000 },
    ],
  },
  { id: 'b', productName: 'PC 16', sizes: [{ uid: 'b1', sheets: 60, length: 1000 }] },
];

const kinds = (d: ReturnType<typeof diffCalcs>) => d.map((x) => x.kind);

describe('original vs Produzione', () => {
  it('finds nothing in two equal versions', () => {
    expect(diffCalcs(version(base()), version(base()), at(7))).toEqual([]);
  });

  it('a reorder of the queue is one difference, not "everything changed"', () => {
    const orig = base();
    orig[1]!.speedMPerMin = 1; // own speed: it can run first
    const [a, b] = structuredClone(orig);
    const d = diffCalcs(version(orig), version([b!, a!]), at(5));
    expect(d).toEqual([
      { group: 'plan', kind: 'orderSequence', original: ['a', 'b'], production: ['b', 'a'] },
    ]);
  });

  it('orders added or removed in Produzione', () => {
    const extra: OrderIn = { id: 'c', sizes: [{ uid: 'c1', sheets: 10, length: 1000 }] };
    const removed = diffCalcs(version(base()), version([base()[0]!]), at(5));
    expect(removed).toMatchObject([{ kind: 'orderRemoved', orderId: 'b' }]);
    const added = diffCalcs(version(base()), version([...base(), extra]), at(5));
    expect(added).toMatchObject([{ kind: 'orderAdded', orderId: 'c' }]);
  });

  it('a speed change is listed once — the orders inheriting it follow', () => {
    const prod = base();
    prod[0]!.speedMPerMin = 2;
    const d = diffCalcs(version(base()), version(prod), at(5));
    expect(d).toEqual([
      {
        group: 'plan',
        kind: 'orderField',
        orderId: 'a',
        field: 'speedMPerMin',
        original: 1,
        production: 2,
      },
    ]);
  });

  it('a speed written in where it was inherited is no change', () => {
    const prod = base();
    prod[1]!.speedMPerMin = 1; // stamped, same value
    expect(diffCalcs(version(base()), version(prod), at(5))).toEqual([]);
  });

  it('sizes: quantity, added, removed, reordered — by uid', () => {
    const prod = base();
    prod[0]!.sizes = [
      { uid: 'a2', sheets: 30, length: 2000 },
      { uid: 'a1', sheets: 50, length: 1000 },
      { uid: 'a3', sheets: 5, length: 1500 },
    ];
    prod[1]!.sizes = [{ uid: 'b2', sheets: 10, length: 1000 }];
    const d = diffCalcs(version(base()), version(prod), at(5));
    expect(d).toContainEqual(
      expect.objectContaining({ kind: 'sizeField', sizeKey: 'a1', field: 'sheets', original: 60, production: 50 }),
    );
    expect(d).toContainEqual(expect.objectContaining({ kind: 'sizeAdded', orderId: 'a', sizeKey: 'a3' }));
    expect(d).toContainEqual(expect.objectContaining({ kind: 'sizeRemoved', orderId: 'b', sizeKey: 'b1' }));
    expect(d).toContainEqual(
      expect.objectContaining({ kind: 'sizeSequence', orderId: 'a', original: ['a1', 'a2'], production: ['a2', 'a1'] }),
    );
  });

  it('settings: paused (Calcolo fisso) and the calc name', () => {
    const d = diffCalcs(
      version(base()),
      version(base(), { frozen: true, productName: 'Linea 2' }),
      at(5),
    );
    expect(d).toContainEqual(expect.objectContaining({ kind: 'setting', key: 'frozen', production: true }));
    expect(d).toContainEqual(expect.objectContaining({ kind: 'setting', key: 'productName', production: 'Linea 2' }));
  });
});

describe('Avanzamento (progress)', () => {
  it('pieces entered in Produzione show — apart from the plan', () => {
    const prod = base();
    prod[0]!.producedSheets = [{ sizeIndex: 0, value: 30 }];
    const d = diffCalcs(version(base()), version(prod), at(5)); // before the start
    expect(d).toEqual([
      { group: 'progress', kind: 'produced', orderId: 'a', sizeKey: 'a1', original: 0, production: 30 },
    ]);
    expect(planDiffCount(d)).toBe(0);
  });

  it('time passing between two saves is no difference', () => {
    // Produzione was reopened (advanced) at 06:45; the original wasn't.
    const original = version(base());
    const adv = buildAdvancedCalc(
      { id: 'x', ts: 0, label: '', ...original },
      at(6, 45),
    )!;
    const production: CalcVersion = { ...adv, snapshot };
    expect(diffCalcs(original, production, at(7, 30))).toEqual([]);
  });

  it('an order marked done in Produzione ahead of the plan', () => {
    const original = version(base());
    // ✓ "Completa" on "a" at 06:30: it leaves the queue as a completed row and
    // "b" starts right away.
    const b = { ...base()[1]!, speedMPerMin: 1 };
    const production: CalcVersion = {
      ...version([b], { startAt: at(6, 30).toISOString() }),
      completedRows: [{ ...original.result.rows[0]!, completed: true }],
    };
    const d = diffCalcs(original, production, at(6, 45));
    expect(d).toContainEqual({
      group: 'progress',
      kind: 'orderDone',
      orderId: 'a',
      original: false,
      production: true,
    });
    expect(kinds(d)).not.toContain('orderRemoved');
    expect(planDiffCount(d)).toBe(0);
  });
});
