import { beforeAll, describe, expect, it } from 'bun:test';

import { safeResumeUrl, safeReturnTo, signInTarget } from '../src/lib/safe-return-to';

const ROOT_DOMAIN = 'shadow-apps.com';
const ORIGIN = 'https://identity.shadow-apps.com';

beforeAll(() => {
  /** Bun's test runtime carries no `window`; both guards read `window.location.origin`, so it's stubbed like a browser would provide it. */
  Object.defineProperty(globalThis, 'window', { value: { location: { origin: ORIGIN } }, writable: true, configurable: true });
});

describe('safeReturnTo', () => {
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

  it('should reject a path that a browser reads as protocol-relative once it strips a tab or newline', () => {
    for (const candidate of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/\t\\evil.com']) expect(safeReturnTo(candidate, ROOT_DOMAIN)).toBeNull();
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

describe('safeResumeUrl', () => {
  const authorize = `${ORIGIN}/oauth2/authorize?client_id=app&redirect_uri=https%3A%2F%2Fapp.shadow-apps.com%2Fcb&state=s`;

  it('should allow the authorize request the identity server parked on this origin', () => {
    expect(safeResumeUrl(authorize)).toBe(authorize);
  });

  it('should allow the parked SAML request', () => {
    expect(safeResumeUrl(`${ORIGIN}/saml2/sso/resume?rid=abc`)).toBe(`${ORIGIN}/saml2/sso/resume?rid=abc`);
  });

  it('should reject a resume on a first-party app under the root domain', () => {
    expect(safeResumeUrl('https://app.shadow-apps.com/oauth2/authorize?client_id=app')).toBeNull();
  });

  it('should reject a resume on a foreign origin', () => {
    expect(safeResumeUrl('https://evil.example/oauth2/authorize?client_id=app')).toBeNull();
  });

  it('should reject a same-origin path other than a handoff endpoint', () => {
    expect(safeResumeUrl(`${ORIGIN}/account`)).toBeNull();
    expect(safeResumeUrl(`${ORIGIN}/oauth2/authorize/../token`)).toBeNull();
  });

  it('should reject a relative or protocol-relative resume', () => {
    for (const candidate of ['/oauth2/authorize?client_id=app', '//evil.example/oauth2/authorize', '/\\evil.example/oauth2/authorize']) expect(safeResumeUrl(candidate)).toBeNull();
  });

  it('should reject a resume that carries credentials', () => {
    for (const candidate of [`https://user@identity.shadow-apps.com/oauth2/authorize`, `https://user:pass@identity.shadow-apps.com/oauth2/authorize`]) {
      expect(safeResumeUrl(candidate)).toBeNull();
    }
  });

  it('should reject a resume carrying control characters', () => {
    expect(safeResumeUrl(`${ORIGIN}/oauth2/authorize\t?client_id=app`)).toBeNull();
  });

  it('should reject a javascript: URL', () => {
    expect(safeResumeUrl('javascript:alert(1)//oauth2/authorize')).toBeNull();
  });

  it('should reject undefined', () => {
    expect(safeResumeUrl(undefined)).toBeNull();
  });
});

describe('signInTarget', () => {
  const authorize = `${ORIGIN}/oauth2/authorize?client_id=app`;

  it("should prefer the server's resume target over an app-supplied returnTo", () => {
    expect(signInTarget({ return_to: authorize, returnTo: '/account/security' }, ROOT_DOMAIN)).toBe(authorize);
  });

  it('should fall back to a safe returnTo when the resume target is refused', () => {
    expect(signInTarget({ return_to: 'https://evil.example/oauth2/authorize', returnTo: '/oauth2/authorize?client_id=app' }, ROOT_DOMAIN)).toBe('/oauth2/authorize?client_id=app');
  });

  it('should refuse an unsafe returnTo even without a resume target', () => {
    expect(signInTarget({ returnTo: '/\\evil.example' }, ROOT_DOMAIN)).toBeNull();
    expect(signInTarget({ return_to: '//evil.example/oauth2/authorize' }, ROOT_DOMAIN)).toBeNull();
  });

  it('should answer null when the sign-in named no destination', () => {
    expect(signInTarget({}, ROOT_DOMAIN)).toBeNull();
  });
});
