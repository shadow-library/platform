import { describe, expect, it } from 'vitest';

import { safeReturnTo } from '@/lib/return-to';
import { signInUrl } from '@/lib/session';

const LOGIN_PATHS = ['/login', '/login/', '/LOGIN/', '/Login?returnTo=%2Fplan', '/%6Cogin', '/login?returnTo=%2Fplan'];

describe('safeReturnTo', () => {
  it.each([
    ['/', '/'],
    ['/plan', '/plan'],
    ['/finance?range=month', '/finance?range=month'],
    ['/quests/q1?tab=log#history', '/quests/q1?tab=log#history'],
    ['/log/meals/', '/log/meals/'],
    ['/finance?note=a%2F%2Fb', '/finance?note=a%2F%2Fb'],
  ])('should keep the same-origin path %s', (candidate, expected) => {
    expect(safeReturnTo(candidate)).toBe(expected);
  });

  it.each([
    '/%09/evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '\t//evil.example',
    ' //evil.example',
    '/\u0000/evil.example',
    '/ /evil.example',
    '//evil.example',
    '%2F%09%2Fevil.example',
    '/%0A/evil.example',
    '/%2F/evil.example',
    '%2F%2Fevil.example',
    '/%5Cevil.example',
    '\\/evil.example',
    '/\\/evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/.//evil.example',
    '/..//evil.example',
    '/%2e//evil.example',
    '/a/..//evil.example',
    '/.\\/evil.example',
    '/.//evil.example/plan?x=1',
    '/a/../%2F/evil.example',
    '/%2e%2e/%2F/evil.example',
  ])('should reject protocol-relative return paths with embedded control characters (%j)', candidate => {
    expect(safeReturnTo(candidate)).toBe('/');
  });

  it.each(['//evil.example', 'https://evil.example/plan', 'http:/evil.example', 'javascript:alert(1)', 'evil.example', '', '/%E0%A4%A'])('should reject %j', candidate => {
    expect(safeReturnTo(candidate)).toBe('/');
  });

  it.each([undefined, null, 42, { path: '/plan' }])('should reject a non-string return path %j', candidate => {
    expect(safeReturnTo(candidate)).toBe('/');
  });

  it.each(LOGIN_PATHS)('should not return to the sign-in redirect itself (%j)', candidate => {
    expect(safeReturnTo(candidate)).toBe('/');
  });

  it('should build the sign-in URL from the sanitised path', () => {
    expect(signInUrl('/%09/evil.example')).toBe('/api/auth/login?return_to=%2F');
    expect(signInUrl('/plan?day=2026-09-13')).toBe('/api/auth/login?return_to=%2Fplan%3Fday%3D2026-09-13');
  });
});
