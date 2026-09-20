import { describe, expect, it } from 'bun:test';

import { formatPagerPosition, resolvePagerPosition } from '../src/lib/item-pager';

const ids = ['amara', 'boone', 'calloway', 'dunsmore'];

describe('resolvePagerPosition', () => {
  it('should place an id in the middle of the list with both neighbours', () => {
    expect(resolvePagerPosition('boone', ids)).toEqual({ kind: 'positioned', index: 1, total: 4, previousId: 'amara', nextId: 'calloway' });
  });

  it('should stop at the first item instead of wrapping to the last', () => {
    expect(resolvePagerPosition('amara', ids)).toEqual({ kind: 'positioned', index: 0, total: 4, previousId: null, nextId: 'boone' });
  });

  it('should stop at the last item instead of wrapping to the first', () => {
    expect(resolvePagerPosition('dunsmore', ids)).toEqual({ kind: 'positioned', index: 3, total: 4, previousId: 'calloway', nextId: null });
  });

  it('should count only the filtered list it was given', () => {
    const characters = ['amara', 'boone'];
    expect(resolvePagerPosition('boone', characters)).toEqual({ kind: 'positioned', index: 1, total: 2, previousId: 'amara', nextId: null });
  });

  it('should refuse to place an id the list no longer holds', () => {
    expect(resolvePagerPosition('retired', ids)).toEqual({ kind: 'unpositioned' });
  });

  it('should refuse to place anything without a list', () => {
    expect(resolvePagerPosition('boone', undefined)).toEqual({ kind: 'unpositioned' });
  });

  it('should refuse to place anything in an empty list', () => {
    expect(resolvePagerPosition('boone', [])).toEqual({ kind: 'unpositioned' });
  });

  it('should refuse a collection of one, which has nowhere to page', () => {
    expect(resolvePagerPosition('amara', ['amara'])).toEqual({ kind: 'unpositioned' });
  });

  it('should refuse to place a missing current id', () => {
    expect(resolvePagerPosition('', ids)).toEqual({ kind: 'unpositioned' });
  });

  it('should take the first occurrence when the list repeats an id', () => {
    expect(resolvePagerPosition('amara', ['amara', 'boone', 'amara'])).toEqual({ kind: 'positioned', index: 0, total: 3, previousId: null, nextId: 'boone' });
  });
});

describe('formatPagerPosition', () => {
  it('should read as a one-based position over the total', () => {
    expect(formatPagerPosition(1, 18)).toBe('2 of 18');
  });
});
