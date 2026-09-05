import { beforeAll, describe, expect, it } from 'bun:test';

import { safeReturnTo } from '../src/lib/safe-return-to';

const ROOT_DOMAIN = 'shadow-apps.com';
const ORIGIN = 'https://identity.shadow-apps.com';

describe('safeReturnTo', () => {
  beforeAll(() => {
    /** Bun's test runtime carries no `window`; `safeReturnTo` reads `window.location.origin`, so it's stubbed like a browser would provide it. */
    Object.defineProperty(globalThis, 'window', { value: { location: { origin: ORIGIN } }, writable: true, configurable: true });
  });

  it('should allow a relative path', () => {
    expect(safeReturnTo('/account', ROOT_DOMAIN)).toBe('/account');
  });

  it('should reject a protocol-relative return', () => {
    expect(safeReturnTo('//evil.example/x', ROOT_DOMAIN)).toBeNull();
  });

  it('should reject a single backslash authority', () => {
    expect(safeReturnTo('/\\evil.com', ROOT_DOMAIN)).toBeNull();
  });

  it('should reject a double backslash authority', () => {
    expect(safeReturnTo('\\\\evil.com', ROOT_DOMAIN)).toBeNull();
  });

  it('should reject an absolute URL on a foreign origin', () => {
    expect(safeReturnTo('https://evil.example', ROOT_DOMAIN)).toBeNull();
  });

  it('should allow a same-origin absolute URL', () => {
    expect(safeReturnTo(`${ORIGIN}/reset`, ROOT_DOMAIN)).toBe(`${ORIGIN}/reset`);
  });

  it('should allow an absolute URL under the root domain', () => {
    expect(safeReturnTo('https://app.shadow-apps.com/dashboard', ROOT_DOMAIN)).toBe('https://app.shadow-apps.com/dashboard');
  });

  it('should reject a javascript: URL', () => {
    expect(safeReturnTo('javascript:alert(1)', ROOT_DOMAIN)).toBeNull();
  });

  it('should reject undefined', () => {
    expect(safeReturnTo(undefined, ROOT_DOMAIN)).toBeNull();
  });

  it('should reject an empty string', () => {
    expect(safeReturnTo('', ROOT_DOMAIN)).toBeNull();
  });
});
