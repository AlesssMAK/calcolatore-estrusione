import { describe, expect, it } from 'vitest';
import { formatSpan } from './format';

describe('formatSpan', () => {
  it('gives the end its time only on the same day', () => {
    expect(
      formatSpan(new Date(2026, 10, 8, 14, 30), new Date(2026, 10, 8, 16, 30)),
    ).toBe('08.11 14:30 → 16:30');
  });

  it('gives the end its date when it falls on another day', () => {
    expect(
      formatSpan(new Date(2026, 10, 8, 22, 0), new Date(2026, 10, 9, 6, 0)),
    ).toBe('08.11 22:00 → 09.11 06:00');
  });
});
