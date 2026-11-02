import '@server/bootstrap';

import { describe, expect, it } from 'bun:test';
import { type AuthPrincipal } from '@shadow-library/auth';
import { IdentityClient } from '@shadow-library/clients/identity';
import { FakeServiceFetch, jsonResponse } from '@shadow-library/clients/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { NovelAccessService } from '@modules/catalog/novel-access.service';

import { roundTrips, scriptedPostgres } from '../scripted-postgres';

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

  describe('readableIds', () => {
    it('should ask identity about every organisation at once, alongside the grant query', async () => {
      let inFlight = 0;
      let peak = 0;
      const identity = new FakeServiceFetch(async call => {
        peak = Math.max(peak, ++inFlight);
        await new Promise(resolve => setImmediate(resolve));
        inFlight--;
        return jsonResponse(200, { member: call.url.includes('/organisations/12/') });
      });
      const postgres = scriptedPostgres([[{ novelId: 4n }]]);
      const service = new NovelAccessService(new FakeDatabaseService({ postgres: postgres.client }), new IdentityClient(identity.fetch));
      const subjects = [
        ORGANISATION_NOVEL,
        { id: 2n, visibility: 'ORGANISATION' as const, organisationId: '13' },
        { id: 3n, visibility: 'ORGANISATION' as const, organisationId: '12' },
        { id: 4n, visibility: 'RESTRICTED' as const, organisationId: null },
        { id: 5n, visibility: 'PUBLIC' as const, organisationId: null },
      ];

      const readable = await service.readableIds(subjects, MEMBER);

      expect([...readable].sort()).toEqual([1n, 3n, 4n, 5n]);
      expect(identity.calls).toHaveLength(2);
      expect(peak).toBe(2);
      expect(roundTrips(postgres)).toBe(1);
    });
  });
});
