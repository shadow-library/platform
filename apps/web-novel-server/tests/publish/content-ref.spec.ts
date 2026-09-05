import { describe, expect, it } from 'bun:test';

import { isImageRef } from '@server/classes';

const HASH = 'a'.repeat(64);

describe('isImageRef', () => {
  it('should accept a content address of <64hex>.<ext>', () => {
    expect(isImageRef(`${HASH}.webp`)).toBe(true);
    expect(isImageRef(`${HASH}.png`)).toBe(true);
    expect(isImageRef(`${'0123456789abcdef'.repeat(4)}.jpg`)).toBe(true);
  });

  it('should reject an svg extension so it never yields a URL', () => {
    expect(isImageRef(`${HASH}.svg`)).toBe(false);
  });

  it('should reject path traversal and absolute paths', () => {
    expect(isImageRef('../secret.webp')).toBe(false);
    expect(isImageRef(`../${HASH}.webp`)).toBe(false);
    expect(isImageRef(`/etc/passwd`)).toBe(false);
    expect(isImageRef(`${HASH}/../evil.webp`)).toBe(false);
    expect(isImageRef(`${HASH}.we/bp`)).toBe(false);
  });

  it('should reject a malformed, over-long, or wrongly-cased hash', () => {
    expect(isImageRef(`${'a'.repeat(63)}.webp`)).toBe(false);
    expect(isImageRef(`${'a'.repeat(65)}.webp`)).toBe(false);
    expect(isImageRef(`${'A'.repeat(64)}.webp`)).toBe(false);
    expect(isImageRef(`${'g'.repeat(64)}.webp`)).toBe(false);
  });

  it('should reject a missing extension, an empty extension, or an uppercase extension', () => {
    expect(isImageRef(HASH)).toBe(false);
    expect(isImageRef(`${HASH}.`)).toBe(false);
    expect(isImageRef(`${HASH}.WEBP`)).toBe(false);
  });

  it('should reject an absent, empty, or non-string ref', () => {
    expect(isImageRef(undefined)).toBe(false);
    expect(isImageRef(null)).toBe(false);
    expect(isImageRef('')).toBe(false);
  });
});
