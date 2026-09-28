import { drizzle } from 'drizzle-orm/bun-sql';

import { schema } from '@server/database';

export interface RecordedQuery {
  sql: string;
  params: unknown[];
}

type Respond = (query: RecordedQuery) => unknown;

export interface RecordingDb {
  db: unknown;
  queries: RecordedQuery[];
}

/**
 * A drizzle handle over `drizzle.mock()`: every awaited builder query is rendered, recorded in order and answered by `respond`. Relational
 * reads (`db.query.<table>.findFirst/findMany`) answer from `relational`, unrecorded; a transaction runs on the same handle.
 */
export function recordingDb(respond: Respond = () => [], relational: Record<string, { findFirst?: unknown; findMany?: unknown[] }> = {}): RecordingDb {
  const mock = drizzle.mock({ schema });
  const queries: RecordedQuery[] = [];

  const wrap = (builder: object): unknown =>
    new Proxy(builder, {
      get(target, property) {
        if (property === 'then')
          return (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
            try {
              const query = (target as { toSQL(): RecordedQuery }).toSQL();
              queries.push(query);
              resolve(respond(query));
            } catch (error) {
              reject(error);
            }
          };
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === 'function' ? (...args: unknown[]) => wrap((value as (...a: unknown[]) => object).apply(target, args)) : value;
      },
    });

  const db = {
    select: (...args: Parameters<typeof mock.select>) => wrap(mock.select(...args)),
    insert: (table: Parameters<typeof mock.insert>[0]) => wrap(mock.insert(table)),
    update: (table: Parameters<typeof mock.update>[0]) => wrap(mock.update(table)),
    delete: (table: Parameters<typeof mock.delete>[0]) => wrap(mock.delete(table)),
    query: new Proxy({} as Record<string, unknown>, {
      get: (_target, table: string) => ({
        findFirst: async () => relational[table]?.findFirst,
        findMany: async () => relational[table]?.findMany ?? [],
      }),
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  return { db, queries };
}
