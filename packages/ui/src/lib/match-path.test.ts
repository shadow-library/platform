/**
 * Importing npm packages
 */
import { describe, expect, it } from 'vitest';

/**
 * Importing user defined packages
 */
import { matchPath } from './match-path';

/**
 * Declaring the constants
 */

describe('matchPath', () => {
  it('matches the destination itself', () => {
    expect(matchPath('/library', '/library')).toBe(true);
  });

  it('matches descendants of the destination', () => {
    expect(matchPath('/library/shelves/3', '/library')).toBe(true);
  });

  it('only matches on a segment boundary', () => {
    // The bug a bare startsWith produces.
    expect(matchPath('/librarything', '/library')).toBe(false);
  });

  it('treats the root as exact', () => {
    expect(matchPath('/', '/')).toBe(true);
    expect(matchPath('/browse', '/')).toBe(false);
  });

  it('honours exact', () => {
    expect(matchPath('/library', '/library', { exact: true })).toBe(true);
    expect(matchPath('/library/shelves', '/library', { exact: true })).toBe(false);
  });

  it('ignores trailing slashes on either side', () => {
    expect(matchPath('/library/', '/library')).toBe(true);
    expect(matchPath('/library', '/library/')).toBe(true);
    expect(matchPath('/library/', '/library/', { exact: true })).toBe(true);
  });

  it('ignores the query string and the hash', () => {
    expect(matchPath('/library?sort=title', '/library', { exact: true })).toBe(true);
    expect(matchPath('/library#top', '/library', { exact: true })).toBe(true);
  });

  it('does not match a different destination', () => {
    expect(matchPath('/browse', '/library')).toBe(false);
  });
});
