import { beforeEach, describe, expect, it } from 'vitest';
import {
  popOpenSaved,
  savePiramidePending,
  stashOpenSaved,
  takePiramidePending,
} from './piramidePending';

const rows = [{ length: 3000, qty: 10 }];

describe('Piramide results waiting for their order', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps only the latest result per calc + order', () => {
    savePiramidePending({ calcId: 'c1', orderId: 'o1', rows });
    savePiramidePending({ calcId: 'c1', orderId: 'o1', rows: [{ length: 2000, qty: 5 }] });
    savePiramidePending({ calcId: 'c1', orderId: 'o2', rows });
    const taken = takePiramidePending('c1');
    expect(taken).toHaveLength(2);
    expect(taken.find((p) => p.orderId === 'o1')?.rows[0]!.length).toBe(2000);
  });

  it('is taken once, and only for its own calc', () => {
    savePiramidePending({ calcId: 'c1', orderId: 'o1', rows });
    savePiramidePending({ calcId: 'c2', orderId: 'o9', rows });
    expect(takePiramidePending('c1')).toHaveLength(1);
    expect(takePiramidePending('c1')).toHaveLength(0);
    expect(takePiramidePending('c2')).toHaveLength(1);
    expect(localStorage.getItem('piramide.pending')).toBeNull();
  });

  it('"open this calc" is one-shot', () => {
    stashOpenSaved('c1');
    expect(popOpenSaved()).toBe('c1');
    expect(popOpenSaved()).toBeNull();
  });
});
