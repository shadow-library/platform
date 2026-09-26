import { is, SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { schema } from '@server/database';

import { bridgeCandidates } from '../finalize-review/bridge-fixtures';
import { matchesWhere, queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

export interface PlanSeed {
  briefs?: Row[];
  milestones?: Row[];
  volumes?: Row[];
  facts?: Row[];
  entities?: Row[];
  knowledge?: Row[];
  drafts?: Row[];
  chapters?: Row[];
  plotThreads?: Row[];
  mysteries?: Row[];
  storyCurrentChapter?: number;
}

const TABLES = {
  briefs: schema.briefs,
  milestones: schema.milestones,
  volumes: schema.volumes,
  canonFacts: schema.canonFacts,
  refinementProposals: schema.refinementProposals,
  chapters: schema.chapters,
  drafts: schema.drafts,
  entities: schema.entities,
  characterKnowledge: schema.characterKnowledge,
  chapterReviews: schema.chapterReviews,
  plotThreads: schema.plotThreads,
  mysteries: schema.mysteries,
  finalizeReviewItems: schema.finalizeReviewItems,
} as const;

type TableName = keyof typeof TABLES;

const BRIEF_DEFAULTS: Row = { volumeKey: null, isEnding: false, claimedMilestones: null, knowledgeContract: null, staleReason: null, revision: 1, contentHash: null };
const MILESTONE_DEFAULTS: Row = { kind: 'custom', state: 'open', plannedChapter: null, reachedChapter: null, boundRevision: null, subjectEntityKey: null };
const DRAFT_DEFAULTS: Row = { body: '', status: 'draft', reviewStatus: 'needs_review', staleReason: null, revision: 1, saveSeq: 0, approvedRevision: null, isolated: false };
const FACT_DEFAULTS: Row = { revealChapter: null, unlock: null, source: 'manual', plannedChapter: null, disclosedInChapter: null, terms: null, writerNote: null };
const KNOWLEDGE_DEFAULTS: Row = { status: 'committed', draftRevision: null };

interface ConflictUpdate {
  set: Row;
  setWhere?: SQL;
}

const dialect = new PgDialect();

function excludedValue(value: SQL, proposed: Row): unknown {
  const column = /^excluded\.(\w+)$/.exec(dialect.sqlToQuery(value).sql)?.[1];
  if (!column) throw new Error(`plan-tables: unsupported upsert value "${dialect.sqlToQuery(value).sql}"`);
  return proposed[column.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase())];
}

/** In-memory project tables behind the drizzle surface the plan rules use, honouring their filters through `sql-filter`. */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function planTables(seed: PlanSeed = {}) {
  let nextId = 1;
  const withId = (defaults: Row) => (row: Row) => ({ id: BigInt(nextId++), projectId: 7n, ...defaults, ...row });
  const tables = new Map<unknown, Row[]>([
    [schema.briefs, (seed.briefs ?? []).map(withId(BRIEF_DEFAULTS))],
    [schema.milestones, (seed.milestones ?? []).map(withId(MILESTONE_DEFAULTS))],
    [schema.volumes, (seed.volumes ?? []).map(withId({}))],
    [schema.canonFacts, (seed.facts ?? []).map(withId(FACT_DEFAULTS))],
    [schema.refinementProposals, []],
    [schema.chapters, (seed.chapters ?? []).map(withId({ status: 'done' }))],
    [schema.drafts, (seed.drafts ?? []).map(withId(DRAFT_DEFAULTS))],
    [schema.entities, (seed.entities ?? []).map(withId({}))],
    [schema.characterKnowledge, (seed.knowledge ?? []).map(row => ({ projectId: 7n, source: 'brief', ...KNOWLEDGE_DEFAULTS, ...row }))],
    [schema.plotThreads, (seed.plotThreads ?? []).map(withId({ status: 'open', intentionallyOpen: false }))],
    [schema.mysteries, (seed.mysteries ?? []).map(withId({ status: 'open', intentionallyOpen: false }))],
    [schema.finalizeReviews, []],
    [schema.finalizeReviewItems, []],
  ]);
  // Only the ledger's (fact, entity) key is modelled: the one conflict target a plan rule upserts arrays against.
  const upsert = (table: unknown, row: Row, set: Row, setWhere?: SQL): void => {
    const clash = table === schema.characterKnowledge ? rows(table).find(existing => existing['factId'] === row['factId'] && existing['entityId'] === row['entityId']) : undefined;
    if (!clash) {
      rows(table).push(row);
      return;
    }
    if (!matchesWhere(clash, setWhere, row)) return;
    for (const [field, value] of Object.entries(set)) clash[field] = is(value, SQL) ? excludedValue(value, row) : value;
  };
  const project: Row = { id: 7n, storyCurrentChapter: seed.storyCurrentChapter ?? 0, premise: null, brief: null, themes: null, instructions: null };
  const rows = (table: unknown): Row[] => tables.get(table) ?? [];
  const finder = (table: unknown) => ({
    findFirst: async (query?: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query)[0],
    findMany: async (query?: Parameters<typeof queryRows>[1]) => queryRows(rows(table), query),
  });
  const query = Object.fromEntries(Object.entries(TABLES).map(([name, table]) => [name, finder(table)])) as Record<TableName, ReturnType<typeof finder>>;
  const locks: unknown[] = [];

  const withItems = (review: Row): Row => ({ ...review, items: rows(schema.finalizeReviewItems).filter(item => item['reviewId'] === review['id']) });
  const finalizeReviews = {
    findFirst: async (q?: Parameters<typeof queryRows>[1]) => queryRows(rows(schema.finalizeReviews), q).map(withItems)[0],
    findMany: async (q?: Parameters<typeof queryRows>[1]) => queryRows(rows(schema.finalizeReviews), q).map(withItems),
  };

  const db = {
    query: { ...query, finalizeReviews, projects: { findFirst: async () => project } },
    select: () => ({
      from: (table: unknown) => ({
        innerJoin: () => ({
          where: async (condition: SQL) =>
            bridgeCandidates({ drafts: rows(schema.drafts), reviews: rows(schema.finalizeReviews).map(withItems), entities: rows(schema.entities) }, condition),
        }),
        where: (condition: SQL) => ({
          for: async () => {
            locks.push(table);
            return table === schema.projects ? [project] : rows(table).filter(row => matchesWhere(row, condition));
          },
        }),
      }),
    }),
    update: (table: unknown) => ({
      set: (values: Row) => ({
        where: (condition: SQL) => {
          const changed = rows(table).filter(row => matchesWhere(row, condition));
          for (const row of changed) Object.assign(row, values);
          return Object.assign(Promise.resolve(), { returning: async () => changed });
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Row | Row[]) => {
        if (Array.isArray(values)) {
          const incoming = values.map(value => ({
            ...(table === schema.finalizeReviewItems ? { id: BigInt(nextId++) } : {}),
            projectId: 7n,
            ...(table === schema.characterKnowledge ? KNOWLEDGE_DEFAULTS : {}),
            ...value,
          }));
          return {
            then: (resolve: () => unknown, reject: (error: unknown) => unknown) => Promise.resolve(void rows(table).push(...incoming)).then(resolve, reject),
            onConflictDoUpdate: async ({ set, setWhere }: ConflictUpdate) => {
              for (const row of incoming) upsert(table, row, set, setWhere);
            },
          };
        }
        const row: Row = { id: BigInt(nextId++), projectId: 7n, ...(table === schema.milestones ? MILESTONE_DEFAULTS : {}), ...values };
        const clash =
          table === schema.briefs
            ? rows(table).find(existing => existing['chapter'] === row['chapter'])
            : table === schema.finalizeReviews
              ? rows(table).find(
                  existing => !row['bridgeOnly'] && !existing['bridgeOnly'] && existing['chapter'] === row['chapter'] && existing['draftRevision'] === row['draftRevision'],
                )
              : undefined;
        if (!clash) rows(table).push(row);
        return Object.assign(Promise.resolve(), {
          returning: async () => [row],
          onConflictDoNothing: () => ({ returning: async () => (clash && table === schema.finalizeReviews ? [] : [row]) }),
          onConflictDoUpdate: ({ set }: { set: Row }) => ({ returning: async () => [clash ? Object.assign(clash, set) : row] }),
        });
      },
    }),
    delete: (table: unknown) => ({
      where: (condition: SQL) => {
        const removed = rows(table).filter(row => matchesWhere(row, condition));
        tables.set(
          table,
          rows(table).filter(row => !removed.includes(row)),
        );
        return Object.assign(Promise.resolve(), { returning: async () => removed });
      },
    }),
    transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => run(db),
  };

  const byKey = (table: unknown, field: string, key: unknown): Row | undefined => rows(table).find(row => row[field] === key);
  return {
    db,
    rows,
    locks,
    brief: (chapter: number) => byKey(schema.briefs, 'chapter', chapter),
    milestone: (key: string) => byKey(schema.milestones, 'milestoneKey', key),
    fact: (key: string) => byKey(schema.canonFacts, 'factKey', key),
    draft: (chapter: number) => byKey(schema.drafts, 'chapter', chapter),
  };
}
