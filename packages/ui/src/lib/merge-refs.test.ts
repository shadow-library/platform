/**
 * Importing npm packages
 */
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Importing user defined packages
 */
import { mergeRefs } from './merge-refs';

/**
 * Declaring the constants
 */

describe('mergeRefs', () => {
  it('assigns the node to object refs', () => {
    const ref = createRef<string>();
    mergeRefs(ref)('node');
    expect(ref.current).toBe('node');
  });

  it('invokes callback refs with the node', () => {
    const callback = vi.fn();
    mergeRefs<string>(callback)('node');
    expect(callback).toHaveBeenCalledWith('node');
  });

  it('fans a single node out to every ref', () => {
    const object = createRef<string>();
    const callback = vi.fn();
    mergeRefs<string>(object, callback)('node');
    expect(object.current).toBe('node');
    expect(callback).toHaveBeenCalledWith('node');
  });

  it('ignores null and undefined refs without throwing', () => {
    const ref = createRef<string>();
    expect(() => mergeRefs<string>(ref, null, undefined)('node')).not.toThrow();
    expect(ref.current).toBe('node');
  });

  it('clears refs when passed null', () => {
    const ref = createRef<string>();
    const merged = mergeRefs<string>(ref);
    merged('node');
    merged(null);
    expect(ref.current).toBeNull();
  });
});
