import { describe, expect, it } from 'bun:test';

import { sanitizeReturnTo } from '@server/modules/auth/flow/auth-flow.service';

const ISSUER = 'https://identity.shadow-apps.com';

describe('sanitizeReturnTo', () => {
  it('should keep a root-relative path with its query and fragment', () => {
    expect(sanitizeReturnTo('/account/security?tab=mfa#passkeys', ISSUER)).toBe('/account/security?tab=mfa#passkeys');
  });

  it('should keep the parked authorize request as a path on the issuer', () => {
    const authorize = '/oauth2/authorize?client_id=app&redirect_uri=https%3A%2F%2Fapp.shadow-apps.com%2Fcb&state=s';
    expect(sanitizeReturnTo(`${ISSUER}${authorize}`, ISSUER)).toBe(authorize);
  });

  it('should drop an undefined or empty destination', () => {
    expect(sanitizeReturnTo(undefined, ISSUER)).toBeUndefined();
    expect(sanitizeReturnTo('', ISSUER)).toBeUndefined();
  });

  it('should refuse a foreign origin however it is spelled', () => {
    const candidates = ['https://evil.test/x', '//evil.test/x', '/\\evil.test/x', '\\\\evil.test/x', `${ISSUER}.evil.test/x`, `${ISSUER}@evil.test/x`, 'javascript:alert(1)'];
    for (const candidate of candidates) expect(sanitizeReturnTo(candidate, ISSUER)).toBeUndefined();
  });

  it('should refuse a path a browser reads as protocol-relative once it strips a control character', () => {
    for (const candidate of ['/\t/evil.test', '/\n/evil.test', '/\r/evil.test', '/\t\\evil.test']) expect(sanitizeReturnTo(candidate, ISSUER)).toBeUndefined();
  });

  it('should refuse a path that normalises to a protocol-relative one', () => {
    expect(sanitizeReturnTo('/.//evil.test/x', ISSUER)).toBeUndefined();
  });

  it('should refuse a sibling app under the same root domain', () => {
    expect(sanitizeReturnTo('https://app.shadow-apps.com/x', ISSUER)).toBeUndefined();
  });
});
