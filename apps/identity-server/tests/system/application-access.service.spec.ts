import { describe, expect, it } from 'bun:test';

import { FakeDatabaseService, InMemoryRedis } from '@shadow-library/modules/testing';

import { PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { type Application, type Organisation } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService } from '@server/modules/system/application/application-access.service';

const organisationRow = (overrides: Partial<Organisation> = {}): Organisation => ({
  id: 7n,
  slug: 'team',
  name: 'Team',
  type: 'TEAM',
  status: 'ACTIVE',
  appAccessMode: 'ALL_APPS',
  isPlatform: false,
  deletedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

const applicationRow = (id: number, visibility: Application.Visibility): Application =>
  ({ id, name: `app-${id}`, visibility, isActive: true, ownerOrganisationId: null }) as unknown as Application;

const THIRTY_DAYS = 30 * 24 * 60 * 60;
const PUBLIC_APP = applicationRow(1, 'PUBLIC');
const INTERNAL_APP = applicationRow(2, 'INTERNAL');

function serviceFor(organisation: Organisation): ApplicationAccessService {
  const postgres = {
    query: {
      organisations: { findFirst: () => Promise.resolve(organisation) },
      applications: { findMany: () => Promise.resolve([PUBLIC_APP, INTERNAL_APP]) },
      organisationApplications: { findMany: () => Promise.resolve([]) },
    },
  };
  return new ApplicationAccessService(new FakeDatabaseService({ postgres }));
}

describe('ApplicationAccessService', () => {
  it('should withhold INTERNAL applications from a team that only borrows the platform organisation name', async () => {
    const namesake = organisationRow({ name: PLATFORM_ORG_NAME, isPlatform: false });

    const granted = await serviceFor(namesake).listOrganisationApplicationIds(namesake.id);

    expect([...granted]).toEqual([PUBLIC_APP.id]);
  });

  it('should grant INTERNAL applications to the organisation marked as the platform organisation, whatever its name', async () => {
    const platform = organisationRow({ id: 1n, name: 'Renamed Platform', isPlatform: true });

    const granted = await serviceFor(platform).listOrganisationApplicationIds(platform.id);

    expect([...granted].sort()).toEqual([PUBLIC_APP.id, INTERNAL_APP.id]);
  });

  describe('version keys', () => {
    it('should bump an organisation grant version and let it lapse long after every grant set cached under it expired', async () => {
      const redis = new InMemoryRedis();
      const service = new ApplicationAccessService(new FakeDatabaseService({ redis }));

      await service.invalidateOrganisation('7');
      await service.invalidateOrganisation('7');

      expect(await redis.get('app_access_version:org:7')).toBe('2');
      expect(await redis.ttl('app_access_version:org:7')).toBe(THIRTY_DAYS);
    });

    it('should not serve a grant set cached before the version key lapsed', async () => {
      let now = 0;
      const redis = new InMemoryRedis({ now: () => now });
      const team = organisationRow({ appAccessMode: 'ASSIGNED_ONLY' });
      let assigned = [{ applicationId: PUBLIC_APP.id }];
      const postgres = {
        query: {
          organisations: { findFirst: () => Promise.resolve(team) },
          applications: { findMany: () => Promise.resolve([PUBLIC_APP]) },
          organisationApplications: { findMany: () => Promise.resolve(assigned) },
        },
      };
      const service = new ApplicationAccessService(new FakeDatabaseService({ postgres, redis }));

      await service.invalidateOrganisation(team.id.toString());
      now = (THIRTY_DAYS - 60) * 1000;
      expect([...(await service.listOrganisationApplicationIds(team.id))]).toEqual([PUBLIC_APP.id]);
      now += 120_000;
      assigned = [];
      await service.invalidateOrganisation(team.id.toString());

      expect([...(await service.listOrganisationApplicationIds(team.id))]).toEqual([]);
    });

    it('should keep the single global version without expiry', async () => {
      const redis = new InMemoryRedis();

      await new ApplicationAccessService(new FakeDatabaseService({ redis })).invalidateGlobal();

      expect(await redis.ttl('app_access_version:global')).toBe(-1);
    });
  });
});
