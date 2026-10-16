import { describe, expect, it } from 'bun:test';

import { AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';

import { parseSelectors } from '@modules/admin/catalog-selectors';

function rejected(raw: string): boolean {
  try {
    parseSelectors(raw);
    return false;
  } catch (error) {
    return AppError.is(error, AppErrorCode.SYN_INVALID_REQUEST);
  }
}

describe('parseSelectors', () => {
  it('should parse key:value pairs separated by commas', () => {
    expect({ ...parseSelectors('tier:performant,content_mode:standard') }).toEqual({ tier: 'performant', content_mode: 'standard' });
  });

  it('should treat an absent or empty value as no selectors', () => {
    expect({ ...parseSelectors(undefined) }).toEqual({});
    expect({ ...parseSelectors('') }).toEqual({});
  });

  it('should reject malformed pairs', () => {
    for (const raw of ['tier', ':x', 'tier:', 'tier:a,', ',tier:a', 'a:b:c', 'a: b', 'a:b c', 'tier:a,tier:b', 'a:ü']) expect(rejected(raw)).toBe(true);
  });

  it('should reject more pairs than the limit and oversized tokens', () => {
    expect(rejected(Array.from({ length: 17 }, (_, index) => `k${index}:v`).join(','))).toBe(true);
    expect(rejected(`${'k'.repeat(65)}:v`)).toBe(true);
  });

  it('should keep a __proto__ selector as an own key without touching the prototype', () => {
    const selectors = parseSelectors('__proto__:polluted');

    expect(Object.hasOwn(selectors, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(selectors)).toBeNull();
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
