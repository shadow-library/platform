/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { csrfSetCookie, ensureCsrfToken, resolveCsrfConfig } from './csrf';

/**
 * Declaring the constants
 *
 * The double-submit rule used to live in each app; these cases came across with it when web-novel-web
 * stopped hand-rolling its own copy, because they cover the parts that are easy to get wrong — expiry, and
 * the two spellings a cookie value arrives in.
 */
const config = resolveCsrfConfig();

describe('ensureCsrfToken', () => {
  const future = (Date.now() + 60_000).toString(36);

  it('should echo the token half of a valid cookie without minting a replacement', () => {
    const csrf = ensureCsrfToken(`session=abc; csrf-token=${future}%3Adeadbeef42; theme=dark`, config);

    expect(csrf.token).toBe('deadbeef42');
    expect(csrf.mintedValue).toBeUndefined();
  });

  it('should accept an unencoded expiry:token cookie value', () => {
    expect(ensureCsrfToken(`csrf-token=${future}:cafebabe`, config).token).toBe('cafebabe');
  });

  it('should honour a bare token with no expiry prefix, as older backends issued', () => {
    const csrf = ensureCsrfToken('csrf-token=legacytoken', config);

    expect(csrf.token).toBe('legacytoken');
    expect(csrf.mintedValue).toBeUndefined();
  });

  it('should mint a fresh expiry:token pair when the cookie is missing', () => {
    const csrf = ensureCsrfToken('session=abc', config);

    expect(csrf.token).toMatch(/^[0-9a-f]{32}$/);
    expect(csrf.mintedValue).toContain(`:${csrf.token}`);
  });

  it('should mint a replacement when the cookie token has expired', () => {
    const expired = (Date.now() - 1_000).toString(36);
    const csrf = ensureCsrfToken(`csrf-token=${expired}%3Astaletoken`, config);

    expect(csrf.token).not.toBe('staletoken');
    expect(csrf.mintedValue).toBeDefined();
  });

  it('should not confuse a cookie whose name merely ends with the csrf cookie name', () => {
    const csrf = ensureCsrfToken(`x-csrf-token=${future}%3Aimposter`, config);

    expect(csrf.token).not.toBe('imposter');
    expect(csrf.mintedValue).toBeDefined();
  });

  it('should treat the token as valid right up to its expiry and stale after it', () => {
    const now = Date.now();
    const boundary = `csrf-token=${(now + 1).toString(36)}%3Aedge`;

    expect(ensureCsrfToken(boundary, config, now).token).toBe('edge');
    expect(ensureCsrfToken(boundary, config, now + 2).token).not.toBe('edge');
  });
});

describe('csrfSetCookie', () => {
  it('should persist a minted pair as a readable, path-wide cookie', () => {
    const csrf = ensureCsrfToken('', config);
    const cookie = csrfSetCookie(csrf.mintedValue as string, config);

    expect(cookie).toMatch(/^csrf-token=.+; Path=\/; Max-Age=3600; SameSite=Lax$/);
    expect(decodeURIComponent(cookie)).toContain(`:${csrf.token}`);
    // Deliberately neither HttpOnly nor `__Host-`: the browser has to read this one back to satisfy the
    // double-submit on its own direct calls.
    expect(cookie).not.toContain('HttpOnly');
  });
});
