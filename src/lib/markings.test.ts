import { beforeEach, describe, expect, it } from 'vitest';
import {
  dataUrlToBlob,
  fillMarking,
  hasOrderSpot,
  loadMyMarkings,
  markingParts,
  normalizeMarkings,
  qrFileName,
  saveMyMarkings,
} from './markings';

const SHEET = 'nr. Del LOTTO - CE - nr. DOP 25900260518 - Stabilit Suisse 1UV';

describe('the order number’s spot', () => {
  it('is the order sheets’ «nr. Del LOTTO», however it’s written', () => {
    expect(hasOrderSpot(SHEET)).toBe(true);
    expect(hasOrderSpot('NR. DEL LOTTO x')).toBe(true);
    expect(hasOrderSpot('nr del  lotto x')).toBe(true);
    expect(hasOrderSpot('Lotto 5')).toBe(false);
  });

  it('or the token', () => {
    expect(hasOrderSpot('Ord. {ordine} - CE')).toBe(true);
    expect(hasOrderSpot('{ORDINE}')).toBe(true);
    expect(hasOrderSpot('CE - nr. DOP 1')).toBe(false);
  });

  it('is filled with the order number (every one of them)', () => {
    expect(fillMarking(SHEET, ' 2611 ')).toBe(
      '2611 - CE - nr. DOP 25900260518 - Stabilit Suisse 1UV'
    );
    expect(fillMarking('{ordine} / {ordine}', 'A7')).toBe('A7 / A7');
    expect(fillMarking('  CE - 1UV \n', '9')).toBe('CE - 1UV');
  });

  it('is shown apart in the text', () => {
    expect(markingParts('Lotto {ordine} CE', '12')).toEqual([
      { text: 'Lotto ', spot: false },
      { text: '12', spot: true },
      { text: ' CE', spot: false },
    ]);
    expect(markingParts(SHEET, '5')[0]).toEqual({ text: '5', spot: true });
    expect(markingParts('CE', '5')).toEqual([{ text: 'CE', spot: false }]);
  });
});

describe('the lists', () => {
  beforeEach(() => localStorage.clear());

  it('drop what is malformed or repeated', () => {
    expect(
      normalizeMarkings([
        { id: 'a', name: ' A ', text: ' x ' },
        { id: 'a', name: 'again', text: 'y' },
        { id: 'b', name: '', text: 'y' },
        { id: 'c', name: 'C', text: '   ' },
        null,
        'nope',
      ])
    ).toEqual([{ id: 'a', name: 'A', text: 'x' }]);
    expect(normalizeMarkings({})).toEqual([]);
  });

  it('«Le Mie» are kept on the device', () => {
    expect(loadMyMarkings()).toEqual([]);
    const list = [{ id: 'm1', name: 'Suisse', text: SHEET }];
    expect(saveMyMarkings(list)).toBe(true);
    expect(loadMyMarkings()).toEqual(list);
    expect(saveMyMarkings([])).toBe(true);
    expect(localStorage.getItem('calc.markings')).toBeNull();
  });

  it('a broken store reads as empty', () => {
    localStorage.setItem('calc.markings', '{oops');
    expect(loadMyMarkings()).toEqual([]);
  });
});

describe('the file', () => {
  it('is named after the order, else the marking', () => {
    expect(qrFileName('26/11 A', 'x', 'y')).toBe('QR-26-11-a.png');
    expect(qrFileName('', 'Stabilit Suisse 1UV', 'y')).toBe(
      'QR-stabilit-suisse-1uv.png'
    );
    expect(qrFileName('', '', 'Però – CE')).toBe('QR-pero-ce.png');
    expect(qrFileName('', '', '***')).toBe('QR-marcatura.png');
  });

  it('a data: URL becomes its bytes', async () => {
    const blob = dataUrlToBlob(`data:image/png;base64,${btoa('PNG!')}`);
    expect(blob.type).toBe('image/png');
    expect(await blob.text()).toBe('PNG!');
  });
});
