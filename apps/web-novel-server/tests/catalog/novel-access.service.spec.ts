import '@server/bootstrap';

import { describe, expect, it } from 'bun:test';
import { type AuthPrincipal } from '@shadow-library/auth';
import { IdentityClient } from '@shadow-library/clients/identity';
import { FakeServiceFetch, jsonResponse } from '@shadow-library/clients/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { NovelAccessService } from '@modules/catalog/novel-access.service';

const MEMBER = { kind: 'user', sub: '7' } as AuthPrincipal;
const ORGANISATION_NOVEL = { id: 1n, visibility: 'ORGANISATION' as const, organisationId: '12' };

function serviceAnswering(...replies: Response[]): { service: NovelAccessService; identity: FakeServiceFetch } {
  const identity = new FakeServiceFetch(() => replies.shift() ?? jsonResponse(500));
  const service = new NovelAccessService(new FakeDatabaseService({}), new IdentityClient(identity.fetch));
  return { service, identity };
}

describe('NovelAccessService', () => {
  it('should ask identity about the reader in the novel organisation and cache a definite answer', async () => {
    const { service, identity } = serviceAnswering(jsonResponse(200, { member: true }));

    expect(await service.canRead(ORGANISATION_NOVEL, MEMBER)).toBe(true);
    expect(await service.canRead(ORGANISATION_NOVEL, MEMBER)).toBe(true);
    expect(identity.calls.map(call => call.url)).toEqual(['http://identity-server/api/v1/internal/organisations/12/members/7']);
  });

  it('should deny on a refused lookup without caching it', async () => {
    const { service, identity } = serviceAnswering(jsonResponse(403, { code: 'FORBIDDEN' }), jsonResponse(200, { member: true }));

    expect(await service.canRead(ORGANISATION_NOVEL, MEMBER)).toBe(false);
    expect(await service.canRead(ORGANISATION_NOVEL, MEMBER)).toBe(true);
    expect(identity.calls).toHaveLength(2);
  });

  it('should deny when identity cannot be reached', async () => {
    const identity = new FakeServiceFetch(() => Promise.reject(new Error('Unable to connect')));
    const service = new NovelAccessService(new FakeDatabaseService({}), new IdentityClient(identity.fetch));

    expect(await service.canRead(ORGANISATION_NOVEL, MEMBER)).toBe(false);
  });
});
