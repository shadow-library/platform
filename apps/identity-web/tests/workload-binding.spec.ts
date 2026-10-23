import { describe, expect, it } from 'bun:test';

import { isValidWorkloadBinding } from '../src/lib/workload-binding';

describe('isValidWorkloadBinding', () => {
  it.each([
    'system:serviceaccount:prod:api',
    'system:serviceaccount:prod:*',
    'system:serviceaccount:prod:api-*',
    'system:serviceaccount:prod:*-worker',
    'system:serviceaccount:prod:a*b',
    'system:serviceaccount:a:b',
    'system:serviceaccount:ns-1:svc-2',
    'system:serviceaccount:0ns:9name',
    'system:serviceaccount:ns:**',
  ])('should accept %s', value => {
    expect(isValidWorkloadBinding(value)).toBe(true);
  });

  it.each([
    '',
    'system:serviceaccount:prod',
    'system:serviceaccount::api',
    'system:serviceaccount:prod:',
    'system:serviceaccount:prod:api:extra',
    'system:serviceaccount:Prod:api',
    'system:serviceaccount:prod:Api',
    'system:serviceaccount:-prod:api',
    'system:serviceaccount:prod-:api',
    'system:serviceaccount:pr*d:api',
    'system:serviceaccount:*:api',
    'system:serviceaccount:prod:-api',
    'system:serviceaccount:prod:api-',
    'system:serviceaccount:prod:api_x',
    'system:serviceaccount:prod:api.x',
    'system:serviceaccount:prod:api ',
    ' system:serviceaccount:prod:api',
    'system:serviceaccount:prod:api\n',
    'serviceaccount:prod:api',
    'system:user:prod:api',
  ])('should reject %p', value => {
    expect(isValidWorkloadBinding(value)).toBe(false);
  });
});
