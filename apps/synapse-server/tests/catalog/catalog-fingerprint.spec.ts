import { describe, expect, it } from 'bun:test';

import { catalogFingerprint } from '@modules/catalog/catalog-fingerprint';

import { catalogDocument } from './catalog.fixtures';

describe('catalogFingerprint', () => {
  it('should ignore key order at every depth', () => {
    expect(catalogFingerprint({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: true } })).toBe(catalogFingerprint({ a: { c: true, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });

  it('should change with any value, including array order', () => {
    const fingerprint = catalogFingerprint(catalogDocument());
    expect(catalogFingerprint(catalogDocument(draft => (draft.budgets[0]!.maxCalls = 999)))).not.toBe(fingerprint);
    expect(catalogFingerprint(catalogDocument(draft => draft.tasks['novel-forge.chat']!.routes.reverse()))).not.toBe(fingerprint);
  });

  it('should be a sha256 hex digest', () => {
    expect(catalogFingerprint({})).toMatch(/^[0-9a-f]{64}$/);
  });
});
