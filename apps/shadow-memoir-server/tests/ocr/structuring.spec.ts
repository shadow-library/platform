import { describe, expect, it } from 'bun:test';

import { toStructuringResult } from '@modules/ocr';

describe('In-cluster receipt structuring (T-33 wiring of ARCHITECTURE §14.3 step 2)', () => {
  it('should map a well-formed model response onto the structuring result', () => {
    const result = toStructuringResult({
      amount: '24.90',
      merchant: 'Corner Grocer',
      category: 'groceries',
      date: '2026-08-20',
      confidence: 0.88,
      lineItems: [{ label: 'Oat milk', amountText: '3.20' }, { label: '' }],
    });

    expect(result.amount).toBe('24.90');
    expect(result.merchant).toBe('Corner Grocer');
    expect(result.lineItems).toEqual([{ label: 'Oat milk', amountText: '3.20', amountMinor: null }]);
  });

  it('should null out every field the receipt did not state rather than guessing one', () => {
    const result = toStructuringResult({ amount: '9.99' });
    expect(result).toEqual({ amount: '9.99', merchant: null, category: null, date: null, confidence: 0, lineItems: null });
  });

  it('should refuse a response with no usable total instead of fabricating one', () => {
    expect(() => toStructuringResult({ merchant: 'Corner Grocer' })).toThrow();
    expect(() => toStructuringResult({ amount: 'about twenty euros' })).toThrow();
    expect(() => toStructuringResult('24.90')).toThrow();
  });

  it('should clamp a confidence the model reported outside 0-1', () => {
    expect(toStructuringResult({ amount: '1.00', confidence: 7 }).confidence).toBe(1);
    expect(toStructuringResult({ amount: '1.00', confidence: -3 }).confidence).toBe(0);
  });
});
