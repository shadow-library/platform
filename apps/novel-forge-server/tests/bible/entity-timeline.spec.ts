import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { EntityService } from '@modules/bible/entity/entity.service';

import { render } from '../generation/generation-fixtures';

function fakeDb(options: { entity?: { id: bigint }; events?: Record<string, unknown>[] }) {
  const queries: { where: SQL; orderBy: unknown }[] = [];
  const db = {
    query: {
      entities: { findFirst: async () => options.entity },
      characterEvents: {
        findMany: async (config: { where: SQL; orderBy: unknown }) => {
          queries.push(config);
          return options.events ?? [];
        },
      },
    },
  };
  return { db, queries };
}

function service(db: unknown): EntityService {
  return new EntityService({ getPostgresClient: () => db } as never, {} as never);
}

describe('EntityService.timeline', () => {
  it('should refuse an unknown entity key', async () => {
    const { db } = fakeDb({});

    await expect(service(db).timeline(7n, 'ghost')).rejects.toMatchObject({ code: 'ENT_001' });
  });

  it("should scope the query to the entity's own id and project", async () => {
    const { db, queries } = fakeDb({ entity: { id: 41n }, events: [] });

    await service(db).timeline(7n, 'mira');

    expect(render(queries[0]?.where)).toMatchObject({ sql: '("character_events"."project_id" = $1 and "character_events"."entity_id" = $2)', params: [7n, 41n] });
  });

  it('should return whatever the query returns, in the order it was asked for (chapter, then created_at)', async () => {
    const events = [
      { id: 1n, chapter: 3, kind: 'state', before: null, after: { location: 'the tower' }, source: 'continuity', status: 'committed' },
      { id: 2n, chapter: 5, kind: 'appearance', before: null, after: { firstChapter: 5 }, source: 'backfill', status: 'committed' },
    ];
    const { db } = fakeDb({ entity: { id: 41n }, events });

    const result = await service(db).timeline(7n, 'mira');

    expect(result).toEqual(events as never);
  });
});
