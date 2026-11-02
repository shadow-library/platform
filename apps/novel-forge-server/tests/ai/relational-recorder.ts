import { drizzle } from 'drizzle-orm/bun-sql';

import { schema } from '@server/database';

export interface RelationalRead {
  table: string;
  sql: string;
  params: unknown[];
}

type Rows = Record<string, unknown[]>;

interface RelationalBuilder {
  toSQL(): { sql: string; params: unknown[] };
}

type RelationalTable = Record<'findMany' | 'findFirst', (config?: unknown) => RelationalBuilder>;

/**
 * `db.query.<table>.findMany/findFirst` that renders each read through drizzle's own relational builder and records the SQL it would send,
 * answering from `rows` whatever the filter: a test reads what was selected and how often, not which rows matched.
 */
export function relationalRecorder(rows: Rows = {}): { query: Record<string, RelationalTable>; reads: RelationalRead[] } {
  const builders = drizzle.mock({ schema }).query as unknown as Record<string, RelationalTable>;
  const reads: RelationalRead[] = [];
  const record = (table: string, kind: 'findMany' | 'findFirst', config?: unknown): void => {
    const builder = builders[table];
    if (!builder) throw new Error(`no relational table ${table}`);
    reads.push({ table, ...builder[kind](config).toSQL() });
  };
  const query = new Proxy({} as Record<string, RelationalTable>, {
    get: (_target, table: string) => ({
      findMany: async (config?: unknown) => {
        record(table, 'findMany', config);
        return rows[table] ?? [];
      },
      findFirst: async (config?: unknown) => {
        record(table, 'findFirst', config);
        return rows[table]?.[0];
      },
    }),
  });
  return { query, reads };
}

/** The column list a recorded read selects, e.g. `["number", "title"]`. */
export function selectedColumns(read: RelationalRead): string[] {
  const list = /^select (.*?) from "/.exec(read.sql)?.[1] ?? '';
  return [...list.matchAll(/"([a-z_]+)"(?=,|$)/g)].map(match => match[1] ?? '');
}

export function readsOf(reads: RelationalRead[], table: string): RelationalRead[] {
  return reads.filter(read => read.table === table);
}
