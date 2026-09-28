import { describe, expect, it } from 'bun:test';

import { FakeDatabaseService } from '@shadow-library/modules/testing';

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
});
