import { describe, expect, it, mock } from 'bun:test';

import { PgDialect } from 'drizzle-orm/pg-core';
import { type SQL } from 'drizzle-orm';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { PLATFORM_ORG_NAME } from '@server/modules/admin/admin.constants';
import { OrganisationService } from '@server/modules/identity/organisation/organisation.service';
import { type Organisation } from '@server/modules/infrastructure/datastore';

interface FindFirstConfig {
  where: SQL;
}

const dialect = new PgDialect();

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

const CALLER = { session: { userId: 11n } as never, ip: '198.51.100.7' };

function serviceWith(postgres: object): OrganisationService {
  const audit = { record: () => Promise.resolve() };
  return new OrganisationService(new FakeDatabaseService({ postgres }), {} as never, {} as never, audit as never, {} as never, {} as never, {} as never);
}

function teamWriter() {
  const created = organisationRow({ id: 9n, name: 'Acme' });
  const tx = {
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve([created]) }), then: (resolve: () => void) => resolve() }) }),
  };
  const transaction = mock((work: (executor: typeof tx) => Promise<Organisation>) => work(tx));
  return { postgres: { transaction }, transaction, created };
}

function platformLookup(rows: { marked?: Organisation; namesake?: Organisation; inserted?: Organisation }) {
  const findFirst = mock((config: FindFirstConfig) => {
    const where = dialect.sqlToQuery(config.where).sql;
    if (where.includes('"is_platform"')) return Promise.resolve(rows.marked);
    return Promise.resolve(rows.namesake);
  });
  const values = mock((row: Partial<Organisation>) => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve(rows.inserted ? [{ ...rows.inserted, ...row }] : []) }) }));
  return { postgres: { query: { organisations: { findFirst } }, insert: () => ({ values }) }, findFirst, values };
}

describe('OrganisationService', () => {
  describe('reserved platform organisation name', () => {
    for (const name of [
      PLATFORM_ORG_NAME,
      '  shadow   PLATFORM ',
      'Shadow\u200b Platform',
      'Shadow\u200bPlatform',
      'shadow-platform',
      'S.h.a.d.o.w P_l_a_t_f_o_r_m!',
      'Sha\u0301dow Pla\u0308tform',
      'Shadow\u3164Platform',
      '\uff33\uff48\uff41\uff44\uff4f\uff57 \uff30\uff4c\uff41\uff54\uff46\uff4f\uff52\uff4d',
    ]) {
      it(`should refuse to create a team named ${JSON.stringify(name)}`, async () => {
        const writer = teamWriter();

        await expect(serviceWith(writer.postgres).createOrganisation(CALLER, { name })).rejects.toMatchObject({ code: 'ORG_012' });
        expect(writer.transaction).not.toHaveBeenCalled();
      });
    }

    for (const name of ['Shadow Platform Fans', 'Shadow Platforms', 'Platform Shadow']) {
      it(`should create a team named ${JSON.stringify(name)}`, async () => {
        const writer = teamWriter();

        await expect(serviceWith(writer.postgres).createOrganisation(CALLER, { name })).resolves.toEqual(writer.created);
        expect(writer.transaction).toHaveBeenCalledTimes(1);
      });
    }

    it('should refuse to rename a team to the platform organisation name', async () => {
      const update = mock(() => ({ set: () => ({ where: () => Promise.resolve() }) }));
      const service = serviceWith({ update });

      await expect(service.renameOrganisation(CALLER, organisationRow(), PLATFORM_ORG_NAME)).rejects.toMatchObject({ code: 'ORG_012' });
      expect(update).not.toHaveBeenCalled();
    });

    it('should let the platform organisation itself keep its name', async () => {
      const update = mock(() => ({ set: () => ({ where: () => Promise.resolve() }) }));
      const platform = organisationRow({ id: 1n, name: 'Platform', isPlatform: true });

      await expect(serviceWith({ update }).renameOrganisation(CALLER, platform, PLATFORM_ORG_NAME)).resolves.toMatchObject({ name: PLATFORM_ORG_NAME });
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  describe('findPlatformOrganisation', () => {
    it('should look the platform organisation up by its marker, never by name', async () => {
      const marked = organisationRow({ id: 1n, isPlatform: true });
      const lookup = platformLookup({ marked, namesake: organisationRow({ name: PLATFORM_ORG_NAME }) });

      await expect(serviceWith(lookup.postgres).findPlatformOrganisation()).resolves.toEqual(marked);
      const where = dialect.sqlToQuery((lookup.findFirst.mock.calls[0] as [FindFirstConfig])[0].where);
      expect(where.sql).toContain('"is_platform"');
      expect(where.sql).not.toContain('"name"');
    });
  });

  describe('ensurePlatformOrganisation', () => {
    it('should return the marked platform organisation without creating another', async () => {
      const marked = organisationRow({ id: 1n, isPlatform: true });
      const lookup = platformLookup({ marked });

      await expect(serviceWith(lookup.postgres).ensurePlatformOrganisation()).resolves.toEqual(marked);
      expect(lookup.values).not.toHaveBeenCalled();
    });

    it('should refuse to adopt or shadow an unmarked organisation bearing the platform name', async () => {
      const lookup = platformLookup({ namesake: organisationRow({ name: PLATFORM_ORG_NAME }) });

      await expect(serviceWith(lookup.postgres).ensurePlatformOrganisation()).rejects.toMatchObject({ code: 'ADM_002' });
      expect(lookup.values).not.toHaveBeenCalled();
    });

    it('should create the platform organisation already marked when none exists', async () => {
      const lookup = platformLookup({ inserted: organisationRow({ id: 1n }) });

      await expect(serviceWith(lookup.postgres).ensurePlatformOrganisation()).resolves.toMatchObject({ id: 1n, isPlatform: true, type: 'TEAM', name: PLATFORM_ORG_NAME });
      expect(lookup.values).toHaveBeenCalledWith(expect.objectContaining({ isPlatform: true, name: PLATFORM_ORG_NAME, type: 'TEAM' }));
    });

    it('should adopt the platform organisation a concurrently booting replica created', async () => {
      const marked = organisationRow({ id: 1n, isPlatform: true });
      const lookup = platformLookup({});
      lookup.values.mockImplementationOnce(() => {
        lookup.findFirst.mockImplementation((config: FindFirstConfig) => Promise.resolve(dialect.sqlToQuery(config.where).sql.includes('"is_platform"') ? marked : undefined));
        return { onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }) };
      });

      await expect(serviceWith(lookup.postgres).ensurePlatformOrganisation()).resolves.toEqual(marked);
    });
  });
});
