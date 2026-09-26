import { is, SQL } from 'drizzle-orm';

import { schema } from '@server/database';

import { queryRows } from '../sql-filter';

type Row = Record<string, unknown>;
type Query = Parameters<typeof queryRows>[1];

export interface DraftSeed {
  drafts?: readonly Row[];
  revisions?: readonly Row[];
  reviews?: readonly Row[];
  chapters?: readonly Row[];
  jobs?: readonly Row[];
  reports?: readonly Row[];
  storyCurrentChapter?: number;
}

export interface TableWrite {
  table: unknown;
  kind: 'insert' | 'update' | 'delete';
  values?: Row;
}

const DRAFT_DEFAULTS: Row = {
  title: null,
  summary: null,
  state: null,
  status: 'draft',
  reviewStatus: 'needs_review',
  staleReason: null,
  revision: 0,
  saveSeq: 0,
  approvedRevision: null,
  generator: 'human',
  isolated: false,
  body: '',
  updatedAt: new Date('2026-09-01T10:00:00Z'),
};

/** A revision row stands in for `created_at > now() - window` with `recent`; a row written during the test is recent. */
const REVISION_DEFAULTS: Row = { source: 'hand_edited', summary: null, recent: true };

const UNIQUE_KEYS = new Map<unknown, string[]>([
  [schema.drafts, ['projectId', 'chapter']],
  [schema.draftRevisions, ['draftId', 'revision']],
]);

/** In-memory tables behind the drizzle surface a chapter's draft saves, approvals and finalize checks use, filtered through `sql-filter`. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function draftTables(seed: DraftSeed = {}) {
  let nextId = 100;
  const withDefaults = (defaults: Row) => (row: Row) => ({ id: BigInt(nextId++), projectId: 7n, ...defaults, ...row });
  const tables = new Map<unknown, Row[]>([
    [schema.projects, [{ id: 7n, storyCurrentChapter: seed.storyCurrentChapter ?? 0 }]],
    [schema.drafts, (seed.drafts ?? []).map(withDefaults(DRAFT_DEFAULTS))],
    [schema.draftRevisions, (seed.revisions ?? []).map(withDefaults(REVISION_DEFAULTS))],
    [schema.chapterReviews, (seed.reviews ?? []).map(withDefaults({ kind: 'judge', remedies: [], createdAt: new Date('2026-09-01T11:00:00Z') }))],
    [schema.chapters, (seed.chapters ?? []).map(withDefaults({ status: 'done', needsRevalidation: false, continuityApplied: false }))],
    [schema.jobs, (seed.jobs ?? []).map(withDefaults({ kind: 'generate', status: 'in_progress' }))],
    [schema.validationReports, (seed.reports ?? []).map(withDefaults({ scope: 'novel', createdAt: new Date('2026-09-01T12:00:00Z') }))],
  ]);
  const rows = (table: unknown): Row[] => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table) as Row[];
  };
  const writes: TableWrite[] = [];
  const clashes = (table: unknown, row: Row): Row | undefined => {
    const keys = UNIQUE_KEYS.get(table);
    return keys && rows(table).find(existing => keys.every(key => existing[key] === row[key]));
  };
  const project = (selection: Row | undefined) => (row: Row) => (selection ? Object.fromEntries(Object.keys(selection).map(key => [key, row[key]])) : row);

  const finder = (table: unknown) => ({
    findFirst: async (query?: Query) => queryRows(rows(table), query)[0],
    findMany: async (query?: Query) => queryRows(rows(table), query),
  });
  const query = new Proxy({} as Record<string, ReturnType<typeof finder>>, {
    get: (_, name: string) => finder((schema as unknown as Record<string, unknown>)[name]),
  });

  const selected = (table: unknown, selection: Row | undefined, where: SQL, orderBy?: SQL) => queryRows(rows(table), { where, orderBy }).map(project(selection));
  const resolved = <T>(value: T) => ({ then: (resolve: (value: T) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(value).then(resolve, reject) });

  const db = {
    query,
    select: (selection?: Row) => ({
      from: (table: unknown) => ({
        where: (where: SQL) => ({
          ...resolved(selected(table, selection, where)),
          for: async () => selected(table, selection, where),
          limit: async (count: number) => selected(table, selection, where).slice(0, count),
          orderBy: (orderBy: SQL) => ({
            ...resolved(selected(table, selection, where, orderBy)),
            limit: async (count: number) => selected(table, selection, where, orderBy).slice(0, count),
          }),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Row | Row[]) => {
        const incoming = (Array.isArray(values) ? values : [values]).map(
          withDefaults(table === schema.drafts ? DRAFT_DEFAULTS : table === schema.draftRevisions ? REVISION_DEFAULTS : {}),
        );
        const insert = (): Row[] => {
          const fresh = incoming.filter(row => !clashes(table, row));
          rows(table).push(...fresh);
          if (fresh.length > 0) writes.push({ table, kind: 'insert', values: Array.isArray(values) ? { rows: values } : values });
          return fresh;
        };
        return {
          then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(insert()).then(() => resolve(undefined), reject),
          returning: async () => insert(),
          onConflictDoNothing: () => ({
            then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(insert()).then(() => resolve(undefined), reject),
            returning: async () => insert(),
          }),
          onConflictDoUpdate: () => ({ ...resolved(undefined), returning: async () => insert() }),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: (where: SQL) => {
          const apply = (): Row[] => {
            const changed = queryRows(rows(table), { where });
            for (const row of changed) {
              for (const [field, value] of Object.entries(values)) {
                if (is(value, SQL)) throw new Error(`draft-tables: an SQL-valued set of ${field} is not modelled`);
                row[field] = value;
              }
            }
            if (changed.length > 0) writes.push({ table, kind: 'update', values });
            return changed;
          };
          return { then: (resolve: (value: unknown) => unknown) => Promise.resolve(apply()).then(() => resolve(undefined)), returning: async () => apply() };
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        const remove = (): Row[] => {
          const removed = queryRows(rows(table), { where });
          tables.set(
            table,
            rows(table).filter(row => !removed.includes(row)),
          );
          if (removed.length > 0) writes.push({ table, kind: 'delete' });
          return removed;
        };
        return { then: (resolve: (value: unknown) => unknown) => Promise.resolve(remove()).then(() => resolve(undefined)), returning: async () => remove() };
      },
    }),
    transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => run(db),
  };

  const draft = (chapter: number): Row | undefined => rows(schema.drafts).find(row => row['chapter'] === chapter);
  const revisionsOf = (chapter: number): Row[] => rows(schema.draftRevisions).filter(row => row['draftId'] === draft(chapter)?.['id']);
  return { db, rows, writes, draft, revisionsOf, writesTo: (table: unknown) => writes.filter(write => write.table === table) };
}
