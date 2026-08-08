import { describe, expect, it } from 'bun:test';

import { computeContentHash } from '@server/common';

describe('computeContentHash', () => {
  it('should return a stable sha256 hex digest', () => {
    const hash = computeContentHash({ title: 'Arc One', objective: 'survive the trial' });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeContentHash({ title: 'Arc One', objective: 'survive the trial' })).toBe(hash);
  });

  it('should be independent of key order, including nested objects', () => {
    const a = computeContentHash({ title: 'Arc One', meta: { hook: 'cliffhanger', beat: 'dread' } });
    const b = computeContentHash({ meta: { beat: 'dread', hook: 'cliffhanger' }, title: 'Arc One' });
    expect(a).toBe(b);
  });

  it('should preserve array order and element identity', () => {
    const base = computeContentHash({ cast: ['hero', 'rival'] });
    expect(computeContentHash({ cast: ['hero', 'rival'] })).toBe(base);
    expect(computeContentHash({ cast: ['rival', 'hero'] })).not.toBe(base);
  });

  it('should change when content changes', () => {
    expect(computeContentHash({ body: 'v1' })).not.toBe(computeContentHash({ body: 'v2' }));
  });

  it('should treat undefined values as null', () => {
    expect(computeContentHash({ body: undefined })).toBe(computeContentHash({ body: null }));
  });
});
