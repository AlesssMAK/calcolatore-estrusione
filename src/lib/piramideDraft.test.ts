import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasPiramideRows,
  loadPiramideDraft,
  piramideDraftKey,
  savePiramideDraft,
} from './piramideDraft';
import { DRAFT_TTL_MS } from './formDraft';

const draft = {
  rows: [{ length: '3000', qty: '10' }],
  base: '',
  lanes: '1',
  maxRows: '',
  minLen: '',
  maxLen: '',
};

describe('Piramide draft expiry (same 15 minutes as the form draft)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('is restored within 15 minutes of the last change', () => {
    savePiramideDraft(draft);
    vi.setSystemTime(new Date('2026-10-11T10:14:00Z'));
    expect(loadPiramideDraft()?.rows[0]!.qty).toBe('10');
  });

  it('is dropped once older than 15 minutes', () => {
    savePiramideDraft(draft);
    vi.setSystemTime(Date.now() + DRAFT_TTL_MS + 1000);
    expect(loadPiramideDraft()).toBeNull();
    expect(localStorage.getItem('piramide.draft')).toBeNull();
  });

  it('drops a draft saved before timestamps existed', () => {
    localStorage.setItem('piramide.draft', JSON.stringify(draft));
    expect(loadPiramideDraft()).toBeNull();
  });
});

describe('Piramide draft key (what counts as unsaved work)', () => {
  it('blank rows and stray spaces are not changes', () => {
    const withBlank = {
      ...draft,
      rows: [{ length: ' 3000', qty: '10 ' }, { length: '', qty: '' }],
    };
    expect(piramideDraftKey(withBlank)).toBe(piramideDraftKey(draft));
  });

  it('an edited quantity or option is', () => {
    expect(
      piramideDraftKey({ ...draft, rows: [{ length: '3000', qty: '12' }] }),
    ).not.toBe(piramideDraftKey(draft));
    expect(piramideDraftKey({ ...draft, lanes: '2' })).not.toBe(
      piramideDraftKey(draft),
    );
  });

  it('no sheet rows → nothing worth a draft', () => {
    expect(hasPiramideRows({ ...draft, rows: [{ length: '', qty: ' ' }] })).toBe(false);
    expect(hasPiramideRows(draft)).toBe(true);
  });
});
