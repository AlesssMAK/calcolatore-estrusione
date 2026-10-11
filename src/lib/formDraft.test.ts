import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_TTL_MS, draftKey, loadDraft, saveDraft } from './formDraft';
import type { FormValues } from '../formSchema';

const values = {
  settings: { startMode: 'now', gapMode: 'continuous' },
  orders: [{ id: 'o1' }],
} as unknown as FormValues;

describe('form draft expiry', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('is restored within 15 minutes of the last change', () => {
    saveDraft({ values, mode: 'sheets' });
    vi.setSystemTime(new Date('2026-10-11T10:14:00Z'));
    expect(loadDraft()?.values.orders[0]!.id).toBe('o1');
  });

  it('is dropped once older than 15 minutes (clean form)', () => {
    saveDraft({ values, mode: 'sheets' });
    vi.setSystemTime(Date.now() + DRAFT_TTL_MS + 1000);
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem('calc.draft')).toBeNull();
  });

  it('every change restarts the 15 minutes', () => {
    saveDraft({ values, mode: 'sheets' });
    vi.setSystemTime(new Date('2026-10-11T10:10:00Z'));
    saveDraft({ values, mode: 'sheets' }); // edited again
    vi.setSystemTime(new Date('2026-10-11T10:20:00Z')); // 20 min after the first
    expect(loadDraft()).not.toBeNull();
  });

  it('drops a draft saved before timestamps existed', () => {
    localStorage.setItem('calc.draft', JSON.stringify({ values, mode: 'sheets' }));
    expect(loadDraft()).toBeNull();
  });
});

describe('draftKey (what counts as unsaved work)', () => {
  const saved = {
    settings: { startMode: 'now', gapMode: 'continuous', queue: undefined },
    orders: [
      {
        id: 'o1',
        sizes: [{ uid: 'a', sheets: 10, length: 3000 }],
        producedSheets: [],
      },
    ],
  };

  it('ignores what merely opening a calc adds (empty Avanzato rows, uids, blanks)', () => {
    const opened = {
      settings: { startMode: 'now', gapMode: 'continuous', startAt: '' },
      orders: [
        {
          id: 'o1',
          sizes: [{ uid: 'b', sheets: 10, length: 3000, profilesPerPackage: null }],
          producedSheets: [{ sizeIndex: 0, value: undefined }],
          sheetsPerPallet: [{ sizeIndex: 0 }],
        },
      ],
    };
    expect(draftKey(opened)).toBe(draftKey(saved));
  });

  it('a real edit is unsaved work', () => {
    const edited = structuredClone(saved);
    edited.orders[0]!.sizes[0]!.sheets = 12;
    expect(draftKey(edited)).not.toBe(draftKey(saved));
    const produced = {
      ...saved,
      orders: [{ ...saved.orders[0]!, producedSheets: [{ sizeIndex: 0, value: 4 }] }],
    };
    expect(draftKey(produced)).not.toBe(draftKey(saved));
  });

  it('keeps the slot of a blank value in a positional list', () => {
    expect(draftKey({ lens: ['', '5000'] })).not.toBe(draftKey({ lens: ['5000', ''] }));
    expect(draftKey({ lens: ['5000', ''] })).toBe(draftKey({ lens: ['5000'] }));
  });
});
