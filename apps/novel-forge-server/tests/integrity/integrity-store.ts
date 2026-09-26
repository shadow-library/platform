import { randomUUID } from 'node:crypto';

import { asc, Column, desc, getTableColumns, is, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { schema } from '@server/database';

import { bridgeCandidates } from '../finalize-review/bridge-fixtures';
import { compileWhere } from '../sql-filter';

type Row = Record<string, unknown>;
type Table = object;
type Selection = Record<string, unknown> | undefined;
type OrderTerm = SQL | Column;

interface FindQuery {
  where?: SQL;
  orderBy?: OrderTerm | OrderTerm[] | ((columns: unknown, operators: { asc: typeof asc; desc: typeof desc }) => OrderTerm | OrderTerm[]);
  with?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

interface ConflictUpdate {
  set: Row;
  setWhere?: SQL;
}

export class UniqueViolation extends Error {
  readonly code = '23505';
}

const dialect = new PgDialect();
const TABLE_NAME = Symbol.for('drizzle:Name');

const UNIQUE_KEYS = new Map<Table, string[]>([
  [schema.drafts, ['projectId', 'chapter']],
  [schema.draftRevisions, ['draftId', 'revision']],
  [schema.briefs, ['projectId', 'chapter']],
  [schema.chapters, ['projectId', 'number']],
  [schema.milestones, ['projectId', 'milestoneKey']],
  [schema.entities, ['projectId', 'entityKey']],
  [schema.canonFacts, ['projectId', 'factKey']],
  [schema.volumes, ['projectId', 'volumeKey']],
  [schema.bibleDocuments, ['projectId', 'section', 'slug']],
  [schema.characterKnowledge, ['factId', 'entityId']],
  [schema.characterStates, ['projectId', 'entityKey']],
  [schema.characterEvents, ['projectId', 'entityId', 'chapter', 'kind', 'detailKey']],
  [schema.entityAppearances, ['entityId', 'chapter']],
  [schema.entityRelationships, ['projectId', 'entityId', 'targetKey', 'kind', 'chapter']],
  [schema.continuityProposals, ['projectId', 'chapter']],
  [schema.finalizeReviewItems, ['reviewId', 'itemKey']],
  [schema.chapterReviewRemedies, ['reviewId', 'findingId']],
  [schema.plotThreads, ['projectId', 'threadKey']],
  [schema.mysteries, ['projectId', 'mysteryKey']],
]);

/** Foreign keys declared `on delete cascade` among the tables a chapter's lifecycle touches. */
const CASCADES = new Map<Table, [Table, string][]>([
  [
    schema.drafts,
    [
      [schema.draftRevisions, 'draftId'],
      [schema.passageSuggestions, 'draftId'],
    ],
  ],
  [schema.finalizeReviews, [[schema.finalizeReviewItems, 'reviewId']]],
  [schema.chapterReviews, [[schema.chapterReviewRemedies, 'reviewId']]],
  [
    schema.entities,
    [
      [schema.entityAppearances, 'entityId'],
      [schema.entityAliases, 'entityId'],
      [schema.entityImages, 'entityId'],
      [schema.characterEvents, 'entityId'],
      [schema.characterKnowledge, 'entityId'],
    ],
  ],
  [schema.canonFacts, [[schema.characterKnowledge, 'factId']]],
]);

const RELATIONS = new Map<Table, Record<string, { table: Table; key: string; order?: string }>>([
  [schema.finalizeReviews, { items: { table: schema.finalizeReviewItems, key: 'reviewId', order: 'position' } }],
  [schema.chapterReviews, { remedies: { table: schema.chapterReviewRemedies, key: 'reviewId' } }],
  [schema.entities, { aliases: { table: schema.entityAliases, key: 'entityId' } }],
]);

const camel = (column: string): string => column.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase());

function tableName(table: Table): string {
  return String((table as Record<symbol, unknown>)[TABLE_NAME] ?? 'unknown');
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined) return 1;
  if (right === null || right === undefined) return -1;
  if (typeof left === 'string' && typeof right === 'string') return left < right ? -1 : 1;
  const [a, b] = [left instanceof Date ? left.getTime() : Number(left), right instanceof Date ? right.getTime() : Number(right)];
  return a === b ? 0 : a < b ? -1 : 1;
}

function orderKey(term: OrderTerm): { key: string; sign: number } {
  if (is(term, Column)) return { key: camel(term.name), sign: 1 };
  const rendered = dialect.sqlToQuery(term).sql;
  const match = /^(?:"\w+"\.)?"(\w+)" (asc|desc)(?: nulls (?:first|last))?$/.exec(rendered);
  if (!match) throw new Error(`integrity-store: unsupported orderBy "${rendered}"`);
  return { key: camel(match[1] as string), sign: match[2] === 'desc' ? -1 : 1 };
}

function sortRows<T extends Row>(rows: T[], orderBy: OrderTerm | OrderTerm[] | undefined): T[] {
  if (orderBy === undefined) return rows;
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).map(orderKey);
  return [...rows].sort((left, right) => {
    for (const { key, sign } of keys) {
      const difference = compareValues(left[key], right[key]);
      if (difference !== 0) return sign * difference;
    }
    return 0;
  });
}

/**
 * The novel's tables in memory, behind the drizzle surface the chapter lifecycle's services use: filters go through `sql-filter`, unique keys
 * and `on conflict` behave as declared, deletes cascade, every read returns a copy, and a transaction that throws leaves no trace.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function integrityStore() {
  let nextId = 1000;
  let xmin = 1;
  const tables = new Map<Table, Row[]>();
  const rows = (table: Table): Row[] => {
    let found = tables.get(table);
    if (!found) tables.set(table, (found = []));
    return found;
  };
  const columnKeys = new Map<Table, Map<unknown, string>>();
  const keyOf = (table: Table, column: unknown): string | undefined => {
    let keys = columnKeys.get(table);
    if (!keys) columnKeys.set(table, (keys = new Map(Object.entries(getTableColumns(table as never)).map(([key, value]) => [value, key]))));
    return keys.get(column);
  };

  const withDefaults = (table: Table, values: Row): Row => {
    const row: Row = { ...values };
    for (const [key, column] of Object.entries(getTableColumns(table as never)) as [string, Column][]) {
      if (row[key] !== undefined) {
        if (is(row[key], SQL)) row[key] = resolveValue(row[key], {}, row);
        continue;
      }
      const config = column as unknown as { defaultFn?: () => unknown; default?: unknown; hasDefault: boolean; columnType: string };
      if (config.columnType === 'PgBigSerial64' || config.columnType === 'PgSerial') row[key] = config.columnType === 'PgSerial' ? nextId++ : BigInt(nextId++);
      else if (config.defaultFn) row[key] = config.defaultFn();
      else if (config.hasDefault && is(config.default, SQL)) row[key] = sqlDefault(config.default);
      else if (config.hasDefault) row[key] = structuredClone(config.default);
      else row[key] = null;
    }
    if (table === schema.drafts) row['xmin'] = String(xmin++);
    if (table === schema.draftRevisions) row['recent'] = true;
    return row;
  };

  const clash = (table: Table, row: Row): Row | undefined => {
    const keys = UNIQUE_KEYS.get(table);
    if (table === schema.finalizeReviews) {
      if (row['bridgeOnly']) return undefined;
      return rows(table).find(existing => !existing['bridgeOnly'] && ['projectId', 'chapter', 'draftRevision'].every(key => existing[key] === row[key]));
    }
    if (table === schema.userFeedback) return row['idempotencyKey'] == null ? undefined : rows(table).find(existing => existing['idempotencyKey'] === row['idempotencyKey']);
    if (!keys) return rows(table).find(existing => existing['id'] !== undefined && existing['id'] === row['id']);
    return rows(table).find(existing => keys.every(key => existing[key] === row[key]));
  };

  const project =
    (table: Table, selection: Selection) =>
    (row: Row): Row => {
      if (!selection) return copyRow(row);
      return Object.fromEntries(
        Object.entries(selection).map(([key, value]) => {
          const column = is(value, Column) ? keyOf(table, value) : undefined;
          return [key, copyValue(row[column ?? key])];
        }),
      );
    };

  const attach = (table: Table, row: Row, relations: Record<string, unknown> | undefined): Row => {
    if (!relations) return row;
    const known = RELATIONS.get(table) ?? {};
    for (const name of Object.keys(relations)) {
      const relation = known[name];
      if (!relation) throw new Error(`integrity-store: relation ${tableName(table)}.${name} is not modelled`);
      const related = rows(relation.table).filter(child => child[relation.key] === row['id']);
      const ordered = relation.order
        ? [...related].sort((left, right) => compareValues(left[relation.order as string], right[relation.order as string]) || compareValues(left['id'], right['id']))
        : related;
      row[name] = ordered.map(copyRow);
    }
    return row;
  };

  const match = (table: Table, query: FindQuery = {}): Row[] => {
    const matches = compileWhere(query.where);
    const orderBy = typeof query.orderBy === 'function' ? query.orderBy(getTableColumns(table as never), { asc, desc }) : query.orderBy;
    const kept = sortRows(
      rows(table).filter(row => matches(row)),
      orderBy,
    );
    return kept.slice(query.offset ?? 0, query.limit === undefined ? undefined : (query.offset ?? 0) + query.limit);
  };
  const find = (table: Table, query: FindQuery = {}): Row[] => match(table, query).map(row => attach(table, copyRow(row), query.with));

  let version = 0;
  const journal: { version: number; table: string }[] = [];
  let lastWrite = new Map<Table, number>();
  const wrote = (table: Table): void => {
    journal.push({ version: ++version, table: tableName(table) });
    lastWrite.set(table, version);
  };

  const cascadeDelete = (table: Table, removed: Row[]): void => {
    for (const [child, key] of CASCADES.get(table) ?? []) {
      const ids = new Set(removed.map(row => row['id']));
      const orphans = rows(child).filter(row => ids.has(row[key]));
      if (orphans.length === 0) continue;
      wrote(child);
      tables.set(
        child,
        rows(child).filter(row => !orphans.includes(row)),
      );
      cascadeDelete(child, orphans);
    }
  };

  const lazy = <T>(run: () => T) => {
    let done = false;
    let result: T;
    return (): T => {
      if (!done) {
        result = run();
        done = true;
      }
      return result;
    };
  };
  const thenable = <T>(run: () => T, returning: (selection?: Selection) => Promise<Row[]>) => ({
    then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
      Promise.resolve()
        .then(run)
        .then(() => resolve(undefined), reject),
    returning,
  });

  const insert = (table: Table) => ({
    values: (values: Row | Row[]) => {
      const incoming = (Array.isArray(values) ? values : [values]).map(value => withDefaults(table, value));
      const write = (conflict: 'raise' | 'nothing' | ConflictUpdate) =>
        lazy((): Row[] => {
          const written: Row[] = [];
          for (const row of incoming) {
            const existing = clash(table, row);
            if (!existing) {
              rows(table).push(row);
              written.push(row);
              wrote(table);
              continue;
            }
            if (conflict === 'raise') throw new UniqueViolation(`duplicate key in ${tableName(table)}`);
            if (conflict === 'nothing') continue;
            if (!compileWhere(conflict.setWhere)(existing, row)) continue;
            const next = Object.fromEntries(Object.entries(conflict.set).map(([field, value]) => [field, resolveValue(value, existing, row)]));
            Object.assign(existing, next);
            if (table === schema.drafts) existing['xmin'] = String(xmin++);
            written.push(existing);
            wrote(table);
          }
          return written;
        });
      const statement = (conflict: 'raise' | 'nothing' | ConflictUpdate) => {
        const run = write(conflict);
        return thenable(run, async selection => run().map(project(table, selection)));
      };
      return {
        ...statement('raise'),
        onConflictDoNothing: () => statement('nothing'),
        onConflictDoUpdate: (config: ConflictUpdate) => statement(config),
      };
    },
  });

  const update = (table: Table) => ({
    set: (values: Row) => ({
      where: (where: SQL) => {
        const run = lazy((): Row[] => {
          const matches = compileWhere(where);
          const changed = rows(table).filter(row => matches(row));
          for (const row of changed) {
            const next = Object.fromEntries(Object.entries(values).map(([field, value]) => [field, resolveValue(value, row, row)]));
            Object.assign(row, next);
            if (table === schema.drafts) row['xmin'] = String(xmin++);
          }
          if (changed.length > 0) wrote(table);
          return changed;
        });
        return thenable(run, async selection => run().map(project(table, selection)));
      },
    }),
  });

  const remove = (table: Table) => ({
    where: (where: SQL) => {
      const run = lazy((): Row[] => {
        const matches = compileWhere(where);
        const removed = rows(table).filter(row => matches(row));
        if (removed.length > 0) wrote(table);
        tables.set(
          table,
          rows(table).filter(row => !removed.includes(row)),
        );
        cascadeDelete(table, removed);
        return removed;
      });
      return thenable(run, async selection => run().map(project(table, selection)));
    },
  });

  const select = (selection?: Selection) => ({
    from: (table: Table) => {
      const read = (where?: SQL, orderBy?: OrderTerm, limit?: number) => match(table, { where, orderBy, limit }).map(project(table, selection));
      const resolved = <T>(value: () => T) => ({
        then: (resolve: (value: T) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve().then(value).then(resolve, reject),
      });
      return {
        ...resolved(() => read()),
        innerJoin: () => ({
          where: async (where: SQL) =>
            bridgeCandidates({ drafts: rows(schema.drafts), reviews: find(schema.finalizeReviews, { with: { items: true } }), entities: rows(schema.entities) }, where),
        }),
        where: (where: SQL) => ({
          ...resolved(() => read(where)),
          for: async () => read(where),
          limit: async (count: number) => read(where, undefined, count),
          orderBy: (orderBy: OrderTerm) => ({
            ...resolved(() => read(where, orderBy)),
            limit: async (count: number) => read(where, orderBy, count),
          }),
        }),
      };
    },
  });

  const query = new Proxy({} as Record<string, { findFirst: (query?: FindQuery) => Promise<Row | undefined>; findMany: (query?: FindQuery) => Promise<Row[]> }>, {
    get: (_, name: string) => {
      const table = (schema as unknown as Record<string, Table>)[name];
      if (!table) throw new Error(`integrity-store: no table ${name}`);
      return { findFirst: async (q?: FindQuery) => find(table, { ...q, limit: 1 })[0], findMany: async (q?: FindQuery) => find(table, q) };
    },
  });

  const db = {
    query,
    select,
    insert,
    update,
    delete: remove,
    transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => {
      // Rows are only ever replaced field by field, never mutated deeper, so a shallow copy of each is a full snapshot.
      const snapshot = new Map([...tables].map(([table, stored]) => [table, stored.map(row => ({ ...row }))]));
      const [savedVersion, savedJournal, savedWrites] = [version, journal.length, new Map(lastWrite)];
      try {
        return await run(db);
      } catch (error) {
        tables.clear();
        for (const [table, stored] of snapshot) tables.set(table, stored);
        version = savedVersion;
        journal.length = savedJournal;
        lastWrite = savedWrites;
        throw error;
      }
    },
  };

  const seed = (table: Table, values: Row[]): Row[] =>
    values.map(value => {
      const row = withDefaults(table, value);
      rows(table).push(row);
      wrote(table);
      return row;
    });
  /** How many committed writes the store has taken; equal versions mean nothing was written in between. */
  const writes = (): number => version;
  const writtenSince = (since: number): string[] => [...new Set(journal.filter(entry => entry.version > since).map(entry => entry.table))];
  /** When each of `watched` was last written: equal stamps mean none of them changed. */
  const stamp = (watched: readonly Table[]): string => watched.map(table => lastWrite.get(table) ?? 0).join(',');
  return { db, rows, seed, writes, writtenSince, stamp, find };
}

export type IntegrityStore = ReturnType<typeof integrityStore>;

/** What a read hands out: the row's own fields, with its jsonb values copied so a caller's change never reaches the store. */
function copyValue(value: unknown): unknown {
  return value !== null && typeof value === 'object' && !(value instanceof Date) ? structuredClone(value) : value;
}

function copyRow(row: Row): Row {
  const copy: Row = {};
  for (const key in row) copy[key] = copyValue(row[key]);
  return copy;
}

function sqlDefault(value: SQL): unknown {
  const rendered = dialect.sqlToQuery(value).sql;
  if (/now\(\)/i.test(rendered)) return new Date();
  if (/gen_random_uuid/i.test(rendered)) return randomUUID();
  if (/^'.*'::jsonb$/.test(rendered)) return JSON.parse(rendered.slice(1, rendered.lastIndexOf("'")));
  if (/^'\{\}'$/.test(rendered)) return [];
  return null;
}

/** The `set` expressions the lifecycle writes: a column from the proposed row, an increment, a coalesce with the stored value, the clock. */
function resolveValue(value: unknown, stored: Row, proposed: Row): unknown {
  if (!is(value, SQL)) return value;
  const rendered = dialect.sqlToQuery(value).sql;
  const excluded = /^excluded\.(\w+)$/i.exec(rendered);
  if (excluded) return proposed[camel(excluded[1] as string)];
  const increment = /^(?:"\w+"\.)?"(\w+)" \+ (\d+)$/.exec(rendered);
  if (increment) return Number(stored[camel(increment[1] as string)]) + Number(increment[2]);
  const coalesce = /^COALESCE\((?:NULLIF\()?EXCLUDED\.(\w+)(, '')?\)?, \w+\.(\w+)\)$/i.exec(rendered);
  if (coalesce) {
    const incoming = proposed[camel(coalesce[1] as string)];
    const blank = coalesce[2] !== undefined && incoming === '';
    return incoming === null || incoming === undefined || blank ? stored[camel(coalesce[3] as string)] : incoming;
  }
  if (/now\(\)/i.test(rendered)) return new Date();
  throw new Error(`integrity-store: unsupported SQL value "${rendered}"`);
}
