import { describe, expect, it } from 'vitest';
import { normalizeCompanySettings } from './catalog';
import { fmtPause, normalizePauseReasons, pauseColorHex } from './pauseReasons';

describe('normalizePauseReasons', () => {
  it('keeps valid reasons, fixed and free', () => {
    expect(
      normalizePauseReasons([
        { id: 'a', name: ' Cambio stampo ', color: 'blue', durationMin: 120 },
        { id: 'b', name: 'Pulizia', color: 'green', durationMin: null },
      ]),
    ).toEqual([
      { id: 'a', name: 'Cambio stampo', color: 'blue', durationMin: 120 },
      { id: 'b', name: 'Pulizia', color: 'green', durationMin: null },
    ]);
  });

  it('drops malformed / duplicate entries and repairs the rest', () => {
    expect(
      normalizePauseReasons([
        null,
        { id: '', name: 'x' },
        { id: 'a', name: '   ' },
        { id: 'b', name: 'Guasto', color: 'red', durationMin: 5000.4 },
        { id: 'b', name: 'Doppio' },
        { id: 'c', name: 'Zero', durationMin: 0 },
      ]),
    ).toEqual([
      { id: 'b', name: 'Guasto', color: 'grey', durationMin: 1440 },
      { id: 'c', name: 'Zero', color: 'grey', durationMin: null },
    ]);
  });

  it('is empty for anything but an array; settings default to []', () => {
    expect(normalizePauseReasons(undefined)).toEqual([]);
    expect(normalizePauseReasons({ a: 1 })).toEqual([]);
    expect(normalizeCompanySettings({}).pauseReasons).toEqual([]);
  });
});

describe('fmtPause / pauseColorHex', () => {
  it('formats durations', () => {
    expect(fmtPause(30)).toBe('30 min');
    expect(fmtPause(120)).toBe('2 h');
    expect(fmtPause(150)).toBe('2 h 30 min');
  });

  it('falls back to grey for an unknown colour', () => {
    expect(pauseColorHex('blue')).toBe('#2563eb');
    expect(pauseColorHex('nope')).toBe('#64748b');
  });
});
