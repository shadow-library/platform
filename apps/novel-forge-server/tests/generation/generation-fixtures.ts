import { ok } from 'node:assert';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { GenerationService } from '@modules/generation/generation.service';
import { schema } from '@server/database';

import { FakeAuthoringClaims } from '../jobs/authoring-claim-fixtures';

export interface DraftRow {
  id: bigint;
  projectId: bigint;
  chapter: number;
  revision: number;
  saveSeq: number;
  approvedRevision: number | null;
  status: 'draft' | 'final';
  staleReason: string | null;
  body: string;
  isolated: boolean;
  generator: 'standard' | 'unrestricted' | 'human';
  updatedAt: Date;
  xmin: string;
}

export interface RecordedWrite {
  table: unknown;
  kind: 'insert' | 'upsert' | 'update' | 'delete';
  values?: Record<string, unknown>;
  where?: SQL;
  setWhere?: SQL;
}

export interface KnowledgeFixture {
  learns: { entityKey: string; factKey: string }[];
  facts: { id: bigint; factKey: string }[];
  entities: { id: bigint; entityKey: string }[];
}

export interface FakeGenerationDbOptions {
  draftReads?: (DraftRow | undefined)[];
  draftWriteResult?: unknown[];
  resetDescendants?: number[];
  knowledge?: KnowledgeFixture;
  /** Chapters that already have a draft, as the next-chapter gate reads them; chapters 1–3 by default, so chapter 4 is writable. */
  written?: number[];
  /** The chapter's latest judge review, as an approval reads it. */
  latestJudgeReview?: unknown;
}

export interface FakeGenerationDb {
  db: { transaction: (run: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
  writes: RecordedWrite[];
  writesTo: (table: unknown, kind?: RecordedWrite['kind']) => RecordedWrite[];
  outcome: () => 'committed' | 'rolled back' | undefined;
}

export interface GenerationDeps {
  modelRouter?: object;
  contextAssembler?: object;
  proposalService?: object;
  chapterImages?: object;
  pluginPolicy?: object;
  claims?: FakeAuthoringClaims;
  writerSnapshots?: object;
}

/** A `WriterSnapshotService` that never touches a database — `onMessages` returns a no-op, once-guarded like the real one. */
export function fakeWriterSnapshots(): { onMessages: () => () => void } {
  return { onMessages: () => () => {} };
}

const dialect = new PgDialect();

export function render(query: SQL | undefined): { sql: string; params: unknown[] } {
  ok(query, 'render() was given no predicate — the fake recorded no matching write');
  return dialect.sqlToQuery(query);
}

export function draftRow(overrides: Partial<DraftRow> = {}): DraftRow {
  return {
    id: 11n,
    projectId: 1n,
    chapter: 4,
    revision: 2,
    saveSeq: 0,
    approvedRevision: null,
    status: 'draft',
    staleReason: null,
    body: 'The keeper counts the ships.',
    isolated: false,
    generator: 'standard',
    updatedAt: new Date('2026-09-01T10:00:00.123Z'),
    xmin: '4711',
    ...overrides,
  };
}

export function knowledgeFixture(): KnowledgeFixture {
  return {
    learns: [{ entityKey: 'keeper', factKey: 'hidden_tide' }],
    facts: [{ id: 31n, factKey: 'hidden_tide' }],
    entities: [{ id: 41n, entityKey: 'keeper' }],
  };
}

function isApprovalReset(values: Record<string, unknown>): boolean {
  return Object.keys(values).sort().join(',') === 'reviewStatus,updatedAt' && values['reviewStatus'] === 'needs_review';
}

export function fakeGenerationDb(options: FakeGenerationDbOptions = {}): FakeGenerationDb {
  const reads = [...(options.draftReads ?? [])];
  const writes: RecordedWrite[] = [];
  const knowledge = options.knowledge;
  let outcome: 'committed' | 'rolled back' | undefined;
  const resultFor = async (table: unknown) => (table === schema.userFeedback ? [{ id: 7n }] : table === schema.drafts ? (options.draftWriteResult ?? []) : []);
  const awaitable = (table: unknown) => Object.assign(Promise.resolve(undefined), { returning: () => resultFor(table) });
  const awaitableRows = (rows: unknown[]) => Object.assign(Promise.resolve(undefined), { returning: async () => rows });

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          then: (resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) => {
            const row = reads.shift();
            return Promise.resolve(row ? [row] : []).then(resolve, reject);
          },
          for: async () => {
            if (table !== schema.drafts) return [];
            const row = reads.shift();
            return row ? [row] : [];
          },
        }),
      }),
    }),
    query: {
      drafts: { findFirst: async () => reads.shift(), findMany: async () => (options.written ?? [1, 2, 3]).map(chapter => ({ chapter })) },
      briefs: { findFirst: async () => (knowledge ? { knowledgeContract: { pov: ['keeper'], learns: knowledge.learns } } : undefined), findMany: async () => [] },
      projects: { findFirst: async () => ({ id: 1n, contentMode: 'standard' }) },
      canonFacts: { findMany: async () => knowledge?.facts ?? [] },
      entities: { findMany: async () => knowledge?.entities ?? [] },
      milestones: { findMany: async () => [] },
      volumes: { findMany: async () => [] },
      bibleDocuments: { findMany: async () => [] },
      chapters: { findFirst: async () => undefined, findMany: async () => [] },
      chapterReviews: { findFirst: async () => options.latestJudgeReview },
      jobs: { findMany: async () => [] },
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const write: RecordedWrite = { table, kind: 'insert', values };
        writes.push(write);
        return {
          returning: () => resultFor(table),
          onConflictDoNothing: () => Object.assign(Promise.resolve(undefined), { returning: () => resultFor(table) }),
          onConflictDoUpdate: (config: { setWhere?: SQL }) => {
            write.kind = 'upsert';
            write.setWhere = config.setWhere;
            return { returning: () => resultFor(table) };
          },
        };
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: SQL) => {
          writes.push({ table, kind: 'update', values, where });
          if (table === schema.drafts && isApprovalReset(values)) return awaitableRows((options.resetDescendants ?? []).map(chapter => ({ chapter })));
          return awaitable(table);
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        writes.push({ table, kind: 'delete', where });
        return awaitable(table);
      },
    }),
    transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      try {
        const result = await run(db);
        outcome = 'committed';
        return result;
      } catch (error) {
        outcome = 'rolled back';
        throw error;
      }
    },
  };

  const writesTo = (table: unknown, kind?: RecordedWrite['kind']) => writes.filter(write => write.table === table && (!kind || write.kind === kind));
  return { db, writes, writesTo, outcome: () => outcome };
}

export function makeGenerationService(db: object, deps: GenerationDeps = {}): GenerationService {
  const absent = {} as never;
  return new GenerationService(
    { getPostgresClient: () => db } as never,
    absent,
    (deps.modelRouter ?? absent) as never,
    (deps.contextAssembler ?? absent) as never,
    absent,
    absent,
    absent,
    absent,
    absent,
    (deps.proposalService ?? absent) as never,
    (deps.chapterImages ?? absent) as never,
    (deps.pluginPolicy ?? absent) as never,
    absent,
    (deps.claims ?? new FakeAuthoringClaims()).asService(),
    (deps.writerSnapshots ?? fakeWriterSnapshots()) as never,
  );
}
