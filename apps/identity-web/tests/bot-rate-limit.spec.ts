import { describe, expect, it } from 'bun:test';

import { isValidRateLimit, MAX_RATE_LIMIT, MIN_RATE_LIMIT, rateLimitError } from '../src/lib/bot-rate-limit';

describe('rateLimitError', () => {
  it('should refuse a rate limit above the maximum', () => {
    expect(rateLimitError(MAX_RATE_LIMIT + 1)).toBe('Enter a rate limit between 1 and 600.');
    expect(rateLimitError(999)).toBe('Enter a rate limit between 1 and 600.');
  });

  it('should refuse a rate limit below the minimum', () => {
    expect(rateLimitError(MIN_RATE_LIMIT - 1)).toBe('Enter a rate limit between 1 and 600.');
    expect(rateLimitError(-5)).toBe('Enter a rate limit between 1 and 600.');
  });

  it('should accept a rate limit in range', () => {
    expect(rateLimitError(MIN_RATE_LIMIT)).toBeUndefined();
    expect(rateLimitError(120)).toBeUndefined();
    expect(rateLimitError(MAX_RATE_LIMIT)).toBeUndefined();
  });

  it('should refuse a rate limit that is not a whole number', () => {
    expect(rateLimitError(12.5)).toBe('Enter a whole number of requests.');
    expect(rateLimitError(600.5)).toBe('Enter a whole number of requests.');
  });

  it('should ask for a rate limit when the field is empty', () => {
    expect(rateLimitError(null)).toBe('Enter a rate limit.');
  });
});

describe('isValidRateLimit', () => {
  it('should accept only a whole number in range', () => {
    expect(isValidRateLimit(120)).toBe(true);
    expect(isValidRateLimit(null)).toBe(false);
    expect(isValidRateLimit(12.5)).toBe(false);
    expect(isValidRateLimit(999)).toBe(false);
  });
});
