import { describe, expect, it } from 'bun:test';

import { nullWhenEmpty } from '../src/lib/apis/empty-response';

describe('nullWhenEmpty', () => {
  it('should map an empty 204 body to null', () => {
    expect(nullWhenEmpty(undefined)).toBeNull();
  });

  it('should keep a body, including falsy ones', () => {
    expect(nullWhenEmpty({ fingerprint: 'f' })).toEqual({ fingerprint: 'f' });
    expect(nullWhenEmpty(0)).toBe(0);
  });
});
