import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { ProjectService } from '@modules/project/project/project.service';
import { schema } from '@server/database';

import { matchesWhere } from '../sql-filter';

type Row = Record<string, unknown>;

const OTHER_OWNER: Row = { ownerKind: 'user', ownerId: 4n, defaultCostTier: 'performant' };

function makeService(accountSettings: Row[], actor: { kind: 'user' | 'bot'; id: bigint } = { kind: 'user', id: 3n }): { service: ProjectService; projects: Row[] } {
  const projects: Row[] = [];
  const insert = (table: unknown) => ({
    values: (values: Row | Row[]) => {
      if (table === schema.projects) projects.push(values as Row);
      const returned = [{ id: 5n, config: null, wordTargetMin: null, wordTargetMax: null, instructions: null, coverImagePath: null, ...(values as Row) }];
      return Object.assign(Promise.resolve(), {
        returning: () => Object.assign(Promise.resolve(returned), { catch: () => Promise.resolve(returned) }),
        catch: () => Promise.resolve(),
      });
    },
  });
  const rows = [...accountSettings, OTHER_OWNER];
  const select = () => ({
    from: (table: unknown) => ({ where: async (condition: SQL) => (table === schema.accountSettings ? rows.filter(row => matchesWhere(row, condition)) : []) }),
  });
  const db = { $count: async () => 0, insert, select };
  const actors = { current: () => ({ ...actor, organisationId: null }) } as never;
  const storage = { getPublicUrl: () => undefined } as never;
  const noop = {} as never;
  return { service: new ProjectService({ getPostgresClient: () => db } as never, actors, storage, noop, noop, noop, noop), projects };
}

describe('ProjectService.create — cost tier', () => {
  it('should start a project on the owner’s default cost tier when the request names none', async () => {
    const { service, projects } = makeService([{ ownerKind: 'user', ownerId: 3n, defaultCostTier: 'economy' }]);

    await service.create({ name: 'The Salt Road', kind: 'new_novel' });

    expect(projects[0]).toMatchObject({ costTier: 'economy' });
  });

  it('should start a project on Balanced when the owner has saved no settings', async () => {
    const { service, projects } = makeService([]);

    await service.create({ name: 'The Salt Road', kind: 'new_novel' });

    expect(projects[0]).toMatchObject({ costTier: 'balanced' });
  });

  it('should let the request’s cost tier outrank the owner’s default', async () => {
    const { service, projects } = makeService([{ ownerKind: 'user', ownerId: 3n, defaultCostTier: 'economy' }]);

    await service.create({ name: 'The Salt Road', kind: 'new_novel', costTier: 'performant' });

    expect(projects[0]).toMatchObject({ costTier: 'performant' });
  });

  it('should start a bot’s project on Balanced even when a row exists for its id', async () => {
    const { service, projects } = makeService([{ ownerKind: 'bot', ownerId: 3n, defaultCostTier: 'economy' }], { kind: 'bot', id: 3n });

    await service.create({ name: 'The Salt Road', kind: 'new_novel' });

    expect(projects[0]).toMatchObject({ costTier: 'balanced' });
  });
});
