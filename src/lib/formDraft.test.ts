import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_TTL_MS, loadDraft, saveDraft } from './formDraft';
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
