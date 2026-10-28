import { describe, expect, it } from 'bun:test';

import { type UnrestrictedAvailability } from '@modules/ai/novel-forge-catalog.service';
import { ProjectService } from '@modules/project/project/project.service';
import { schema } from '@server/database';

type Row = Record<string, unknown>;

interface Fixture {
  service: ProjectService;
  projects: Row[];
  sets: Row[];
  asked: () => number;
}

const SOURCE: Row = { id: 5n, kind: 'new_novel', title: 'The Salt Road', instructions: null, contentMode: 'standard', costTier: 'economy', config: null };

function makeService(available?: boolean, stored: Row = SOURCE): Fixture {
  const projects: Row[] = [];
  const sets: Row[] = [];
  const presented = (values: Row): Row[] => [{ id: 6n, config: null, wordTargetMin: null, wordTargetMax: null, instructions: null, coverImagePath: null, ...values }];
  const insert = (table: unknown) => ({
    values: (values: Row | Row[]) => {
      if (table === schema.projects) projects.push(values as Row);
      const returned = presented(values as Row);
      return Object.assign(Promise.resolve(), {
        returning: () => Object.assign(Promise.resolve(returned), { catch: () => Promise.resolve(returned) }),
        catch: () => Promise.resolve(),
      });
    },
  });
  const update = () => ({
    set: (values: Row) => {
      sets.push(values);
      const returned = presented({ ...stored, ...values });
      return { where: () => ({ returning: () => Object.assign(Promise.resolve(returned), { catch: () => Promise.resolve(returned) }) }) };
    },
  });
  const query = {
    projects: { findFirst: async () => stored },
    bibleDocuments: { findMany: async () => [] },
    entities: { findMany: async () => [] },
    volumes: { findMany: async () => [] },
  };
  const db = { $count: async () => 0, insert, update, query, transaction: (work: (tx: unknown) => Promise<unknown>) => work(db) };
  let asked = 0;
  const catalog: UnrestrictedAvailability | undefined =
    available === undefined
      ? undefined
      : {
          unrestrictedAvailable: async () => {
            asked++;
            return available;
          },
        };
  const actors = { current: () => ({ kind: 'user', id: 3n, organisationId: null }) } as never;
  const storage = { getPublicUrl: () => undefined } as never;
  const noop = {} as never;
  const service = new ProjectService({ getPostgresClient: () => db } as never, actors, storage, noop, noop, noop, noop, catalog as never);
  return { service, projects, sets, asked: () => asked };
}

describe('ProjectService — pace', () => {
  it('should start a project on Balanced when the request names no cost tier', async () => {
    const { service, projects } = makeService();

    await service.create({ name: 'The Salt Road', kind: 'new_novel' });

    expect(projects[0]).toMatchObject({ costTier: 'balanced' });
  });

  it('should start a project on the cost tier the request names', async () => {
    const { service, projects } = makeService();

    await service.create({ name: 'The Salt Road', kind: 'new_novel', costTier: 'performant' });

    expect(projects[0]).toMatchObject({ costTier: 'performant' });
  });
});

describe('ProjectService — unrestricted availability', () => {
  it('should create an unrestricted project only while the catalog routes it', async () => {
    const offered = makeService(true);
    await offered.service.create({ name: 'The Salt Road', kind: 'new_novel', contentMode: 'unrestricted' });
    expect(offered.projects[0]).toMatchObject({ contentMode: 'unrestricted' });

    const withheld = makeService(false);
    await expect(withheld.service.create({ name: 'The Salt Road', kind: 'new_novel', contentMode: 'unrestricted' })).rejects.toMatchObject({ code: 'AI_024' });
    expect(withheld.projects).toHaveLength(0);
  });

  it('should refuse unrestricted with no catalog to ask, and never ask for a standard project', async () => {
    await expect(makeService().service.create({ name: 'The Salt Road', kind: 'new_novel', contentMode: 'unrestricted' })).rejects.toMatchObject({ code: 'AI_024' });

    const standard = makeService(false);
    await standard.service.create({ name: 'The Salt Road', kind: 'new_novel', contentMode: 'standard' });
    expect(standard.asked()).toBe(0);
  });

  it('should refuse raising a standard project to unrestricted while it is unavailable', async () => {
    const { service, sets } = makeService(false);

    await expect(service.update(5n, { contentMode: 'unrestricted' })).rejects.toMatchObject({ code: 'AI_024' });
    expect(sets).toHaveLength(0);
  });

  it('should let a project already unrestricted be saved with its mode unchanged, so its calls fail loudly instead', async () => {
    const { service, sets, asked } = makeService(false, { ...SOURCE, contentMode: 'unrestricted' });

    await service.update(5n, { contentMode: 'unrestricted', costTier: 'performant' });

    expect(sets[0]).toMatchObject({ contentMode: 'unrestricted', costTier: 'performant' });
    expect(asked()).toBe(0);
  });

  it('should refuse a clone that would start unrestricted, asked for or inherited', async () => {
    await expect(makeService(false).service.clone(5n, { name: 'Copy', contentMode: 'unrestricted' })).rejects.toMatchObject({ code: 'AI_024' });
    await expect(makeService(false, { ...SOURCE, contentMode: 'unrestricted' }).service.clone(5n, { name: 'Copy' })).rejects.toMatchObject({ code: 'AI_024' });

    const standard = makeService(false, { ...SOURCE, contentMode: 'unrestricted' });
    await standard.service.clone(5n, { name: 'Copy', contentMode: 'standard' });
    expect(standard.projects[0]).toMatchObject({ contentMode: 'standard' });
  });
});
