import { ok } from 'node:assert';

import { type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { GenerationService } from '@modules/generation/generation.service';
import { schema } from '@server/database';

export interface DraftRow {
  id: bigint;
  projectId: bigint;
  chapter: number;
  revision: number;
  status: 'draft' | 'final';
  staleReason: string | null;
  body: string;
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

export interface FakeGenerationDbOptions {
  draftReads?: (DraftRow | undefined)[];
  draftWriteResult?: unknown[];
}

export interface FakeGenerationDb {
  db: { transaction: (run: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
  writes: RecordedWrite[];
  writesTo: (table: unknown, kind?: RecordedWrite['kind']) => RecordedWrite[];
}

export interface GenerationDeps {
  modelRouter?: object;
  contextAssembler?: object;
  toolRegistry?: object;
  pluginPolicy?: object;
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
    status: 'draft',
    staleReason: null,
    body: 'The keeper counts the ships.',
    updatedAt: new Date('2026-09-01T10:00:00.123Z'),
    xmin: '4711',
    ...overrides,
  };
}

export function fakeGenerationDb(options: FakeGenerationDbOptions = {}): FakeGenerationDb {
  const reads = [...(options.draftReads ?? [])];
  const writes: RecordedWrite[] = [];
  const resultFor = async (table: unknown) => (table === schema.userFeedback ? [{ id: 7n }] : table === schema.drafts ? (options.draftWriteResult ?? []) : []);
  const awaitable = (table: unknown) => Object.assign(Promise.resolve(undefined), { returning: () => resultFor(table) });

  const db = {
    select: () => ({
      from: () => ({
        where: async () => {
          const row = reads.shift();
          return row ? [row] : [];
        },
      }),
    }),
    query: {
      drafts: { findFirst: async () => reads.shift() },
      briefs: { findFirst: async () => undefined },
      projects: { findFirst: async () => ({ id: 1n }) },
      canonFacts: { findMany: async () => [] },
    },
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const write: RecordedWrite = { table, kind: 'insert', values };
        writes.push(write);
        return {
          returning: () => resultFor(table),
          onConflictDoNothing: async () => undefined,
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
    transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };

  const writesTo = (table: unknown, kind?: RecordedWrite['kind']) => writes.filter(write => write.table === table && (!kind || write.kind === kind));
  return { db, writes, writesTo };
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
    (deps.toolRegistry ?? absent) as never,
    absent,
    absent,
    absent,
    absent,
    (deps.pluginPolicy ?? absent) as never,
    absent,
  );
}
