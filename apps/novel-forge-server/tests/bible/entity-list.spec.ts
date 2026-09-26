import { describe, expect, it } from 'bun:test';
import { type SQL } from 'drizzle-orm';

import { EntityService } from '@modules/bible/entity/entity.service';
import { type ListEntitiesQuery } from '@modules/bible/entity/entity.dto';

import { queryRows } from '../sql-filter';

type FindManyQuery = NonNullable<Parameters<typeof queryRows>[1]>;

function entity(index: number) {
  return {
    id: BigInt(index),
    projectId: 1n,
    entityKey: `entity-${index}`,
    type: 'character',
    name: `Entity ${index}`,
    updatedAt: new Date(2024, 0, 1, 0, 0, index),
    createdAt: new Date(2024, 0, 1, 0, 0, index),
    imagePath: null,
  };
}

function fakeDatabase(entities: ReturnType<typeof entity>[]) {
  return {
    query: {
      entities: {
        findMany: async (query: FindManyQuery & { limit?: number; offset?: number }) => {
          const rows = queryRows(entities, query);
          const offset = query.offset ?? 0;
          const limit = query.limit ?? rows.length;
          return rows.slice(offset, offset + limit);
        },
      },
    },
    $count: async (table: unknown, where: SQL | undefined) => queryRows(entities, { where }).length,
  };
}

function query(overrides: Partial<ListEntitiesQuery> = {}): ListEntitiesQuery {
  return { limit: 25, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc', ...overrides } as ListEntitiesQuery;
}

function service(db: ReturnType<typeof fakeDatabase>) {
  const databaseService = { getPostgresClient: () => db } as never;
  const storage = { getPublicUrl: () => undefined } as never;
  return new EntityService(databaseService, storage);
}

describe('EntityService.list — pagination beyond 500 entities', () => {
  it('should return page 3 of 600 entities', async () => {
    const entities = Array.from({ length: 600 }, (_, i) => entity(i));
    const result = await service(fakeDatabase(entities)).list(1n, query({ limit: 25, offset: 50 }));

    expect(result.total).toBe(600);
    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(24);
    expect(result.items).toHaveLength(25);
    // Sorted by updatedAt desc, entity 599 is newest — page 3 (offset 50) starts at the 51st newest.
    expect(result.items[0]?.entityKey).toBe('entity-549');
    expect(result.items[24]?.entityKey).toBe('entity-525');
  });

  it('should keep the per-page limit at 500 while offset keeps paging beyond it', async () => {
    const entities = Array.from({ length: 600 }, (_, i) => entity(i));
    const result = await service(fakeDatabase(entities)).list(1n, query({ limit: 500, offset: 500 }));

    expect(result.total).toBe(600);
    expect(result.items).toHaveLength(100);
  });
});
