import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { ProjectService } from '@modules/project/project/project.service';

type Row = Record<string, unknown>;

const project: Row = {
  id: 5n,
  name: 'The Tide Bargain',
  kind: 'new_novel',
  contentMode: 'standard',
  costTier: 'balanced',
  config: null,
  wordTargetMin: null,
  wordTargetMax: null,
  instructions: null,
  coverImagePath: null,
  theme: 'What we owe the sea',
  ending: 'Mira keeps the lamp lit.',
};

function makeService(): { service: ProjectService; sets: Row[] } {
  const sets: Row[] = [];
  const db = {
    update: () => ({
      set: (values: Row) => {
        sets.push(values);
        return { where: () => ({ returning: () => Object.assign(Promise.resolve([{ ...project, ...values }]), { catch: () => Promise.resolve([{ ...project, ...values }]) }) }) };
      },
    }),
  };
  const noop = {} as never;
  const storage = { getPublicUrl: () => undefined } as never;
  return { service: new ProjectService({ getPostgresClient: () => db } as never, noop, storage, noop, noop, noop, noop), sets };
}

describe('ProjectService.update — story fields and cost tier', () => {
  it('should write the story fields it is sent trimmed, clearing blanks and nulls', async () => {
    const { service, sets } = makeService();

    const result = await service.update(5n, { endingQuestion: '  Will Mira pay the tide?  ', readerPromise: '   ', opposition: null, protagonistKey: 'mira' });

    expect(sets[0]).toMatchObject({ endingQuestion: 'Will Mira pay the tide?', readerPromise: null, opposition: null, protagonistKey: 'mira' });
    expect(result).toMatchObject({ theme: 'What we owe the sea', ending: 'Mira keeps the lamp lit.', protagonistKey: 'mira' });
  });

  it('should keep the finalize-review settings when a project update replaces the model config', async () => {
    const { service, sets } = makeService();

    await service.update(5n, { config: {} });

    const { sql } = new PgDialect().sqlToQuery(sets[0]?.['config'] as SQL);
    expect(sql).toContain(`jsonb_build_object('finalizeReview', "projects"."config" -> 'finalizeReview')`);
    expect(sql).toContain('::jsonb ||');
  });

  it('should leave the story fields it is not sent untouched', async () => {
    const { service, sets } = makeService();

    await service.update(5n, { costTier: 'performant' });

    expect(sets[0]).toMatchObject({ costTier: 'performant' });
    for (const field of ['theme', 'endingQuestion', 'ending', 'readerPromise', 'protagonistKey', 'opposition']) expect(sets[0]).not.toHaveProperty(field);
  });
});
