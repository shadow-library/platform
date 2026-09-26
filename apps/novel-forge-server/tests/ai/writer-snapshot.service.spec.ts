import { describe, expect, it } from 'bun:test';

import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { type SQL } from 'drizzle-orm';

import { WriterSnapshotService } from '@modules/ai/writer-snapshot.service';

import { matchesWhere, queryRows } from '../sql-filter';

type Row = Record<string, unknown>;

const ROUTE = { provider: 'openrouter', model: 'test-writer-model' };

function baseMeta(overrides: Partial<Parameters<WriterSnapshotService['onMessages']>[0]> = {}) {
  return {
    projectId: 7n,
    chapter: 5,
    draftRevision: 0,
    attempt: 0,
    role: 'draft' as const,
    contextPackId: null,
    keptBack: { withheldForSecrecy: {}, omittedForBudget: null },
    planRevision: 1,
    bibleHash: 'hash-0',
    promptKey: 'generation',
    promptVersion: '1',
    isolated: false,
    runId: 'run-1',
    ...overrides,
  };
}

function fakeDb(options: { draftIsolated?: boolean } = {}) {
  let nextId = 1n;
  const rows: Row[] = [];
  const db = {
    insert: () => ({
      values: async (values: Row) => {
        rows.push({ id: nextId++, createdAt: new Date(), ...values });
      },
    }),
    delete: () => ({
      where: async (cond: SQL) => {
        const kept = rows.filter(row => !matchesWhere(row, cond));
        rows.length = 0;
        rows.push(...kept);
      },
    }),
    query: {
      drafts: { findFirst: async () => (options.draftIsolated === undefined ? undefined : { isolated: options.draftIsolated }) },
      chapters: { findFirst: async () => undefined },
      writerSnapshots: {
        findMany: async (opts: { where?: SQL; orderBy?: SQL | SQL[] }) => queryRows(rows, opts as never),
        findFirst: async (opts: { where?: SQL }) => queryRows(rows, opts as never)[0],
      },
    },
  };
  return { db, rows };
}

function service(db: unknown): WriterSnapshotService {
  return new WriterSnapshotService({ getPostgresClient: () => db } as never);
}

describe('WriterSnapshotService.onMessages', () => {
  it('should capture the exact messages the fake router received', async () => {
    const { db, rows } = fakeDb();
    const svc = service(db);
    const messages = [new SystemMessage('Write the plain web-novel style.'), new HumanMessage('## CHAPTER BRIEF\nThe keeper counts the ships.')];

    svc.onMessages(baseMeta())(messages, ROUTE);
    await Promise.resolve();
    await Promise.resolve();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.['messages']).toEqual([
      { role: 'system', content: 'Write the plain web-novel style.' },
      { role: 'human', content: '## CHAPTER BRIEF\nThe keeper counts the ships.' },
    ]);
    expect(rows[0]?.['modelRoute']).toEqual(ROUTE);
  });

  it('should ignore every call after the first — a ctx clone reused for draft expansion or a title call never overwrites the attempt', async () => {
    const { db, rows } = fakeDb();
    const svc = service(db);
    const onMessages = svc.onMessages(baseMeta());

    onMessages([new HumanMessage('first call — the real attempt')], ROUTE);
    onMessages([new AIMessage('second call — an expansion pass on the same cloned ctx')], ROUTE);
    await Promise.resolve();
    await Promise.resolve();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.['messages']).toEqual([{ role: 'human', content: 'first call — the real attempt' }]);
  });
});

describe('WriterSnapshotService — a later Bible edit', () => {
  it('should never change a stored snapshot', async () => {
    const { db } = fakeDb();
    const svc = service(db);

    svc.onMessages(baseMeta({ draftRevision: 0, bibleHash: 'hash-before-the-edit' }))([new HumanMessage('the chapter as first drafted')], ROUTE);
    await Promise.resolve();
    await Promise.resolve();
    const [before] = await svc.list(7n, 5);

    // The Story Bible changes, and the chapter is regenerated against it — a second, later attempt.
    svc.onMessages(baseMeta({ draftRevision: 1, attempt: 0, bibleHash: 'hash-after-the-edit' }))([new HumanMessage('the chapter rewritten after the edit')], ROUTE);
    await Promise.resolve();
    await Promise.resolve();

    const reread = await svc.get(7n, 5, before!.id);
    expect(reread.bibleHash).toBe('hash-before-the-edit');
    expect(reread.messages).toEqual([{ role: 'human', content: 'the chapter as first drafted' }]);
  });
});

describe('WriterSnapshotService — isolation read policy', () => {
  it("should wall off an isolated chapter's messages and drop its bible hash on a standard read", async () => {
    const { db } = fakeDb();
    const svc = service(db);
    svc.onMessages(baseMeta({ isolated: true, bibleHash: 'never-shown' }))([new HumanMessage('raw isolated prose')], ROUTE);
    await Promise.resolve();
    await Promise.resolve();

    const [summary] = await svc.list(7n, 5);
    const view = await svc.get(7n, 5, summary!.id);

    expect(view.messages).not.toEqual([{ role: 'human', content: 'raw isolated prose' }]);
    expect(JSON.stringify(view.messages)).not.toContain('raw isolated prose');
    expect(view.bibleHash).toBeNull();
  });

  it('should wall off a snapshot taken before its chapter was isolated', async () => {
    const { db } = fakeDb({ draftIsolated: true });
    const svc = service(db);
    svc.onMessages(baseMeta({ isolated: false, bibleHash: 'never-shown' }))([new HumanMessage('prose from before isolation')], ROUTE);
    await Promise.resolve();
    await Promise.resolve();

    const [summary] = await svc.list(7n, 5);
    const view = await svc.get(7n, 5, summary!.id);

    expect(JSON.stringify(view.messages)).not.toContain('prose from before isolation');
    expect(view.bibleHash).toBeNull();
    expect(view.isolated).toBe(true);
  });

  it('should return a standard chapter’s messages unchanged', async () => {
    const { db } = fakeDb();
    const svc = service(db);
    svc.onMessages(baseMeta({ isolated: false }))([new HumanMessage('ordinary prose')], ROUTE);
    await Promise.resolve();
    await Promise.resolve();

    const [summary] = await svc.list(7n, 5);
    const view = await svc.get(7n, 5, summary!.id);

    expect(view.messages).toEqual([{ role: 'human', content: 'ordinary prose' }]);
  });
});

describe('WriterSnapshotService — each attempt role', () => {
  it.each(['draft', 'repair', 'rewrite', 'revise'] as const)('should capture a %s attempt with its role recorded', async role => {
    const { db, rows } = fakeDb();
    const svc = service(db);

    svc.onMessages(baseMeta({ role }))([new HumanMessage(`a ${role} attempt`)], ROUTE);
    await Promise.resolve();
    await Promise.resolve();

    expect(rows[0]?.['role']).toBe(role);
  });
});

describe('WriterSnapshotService — retention', () => {
  it('should keep the current draft revision and its two predecessors, pruning anything older as a newer attempt lands', async () => {
    const { db, rows } = fakeDb();
    const svc = service(db);

    for (let revision = 0; revision <= 3; revision++) {
      svc.onMessages(baseMeta({ draftRevision: revision }))([new HumanMessage(`revision ${revision}`)], ROUTE);
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(rows.map(row => row['draftRevision']).sort()).toEqual([1, 2, 3]);
  });

  it('should never prune anything while finalize or approve run — retention only ever follows a new capture', async () => {
    const { db, rows } = fakeDb();
    const svc = service(db);
    svc.onMessages(baseMeta({ draftRevision: 0 }))([new HumanMessage('the only attempt')], ROUTE);
    await Promise.resolve();
    await Promise.resolve();

    expect(rows).toHaveLength(1);
  });
});

describe('WriterSnapshotService — failure isolation', () => {
  it('should never throw when the write fails, so a snapshot failure can never fail the generation it captures', async () => {
    const db = {
      insert: () => ({
        values: () => Promise.reject(new Error('database unavailable')),
      }),
    };
    const svc = service(db);

    expect(() => svc.onMessages(baseMeta())([new HumanMessage('anything')], ROUTE)).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});

describe('WriterSnapshotService.get', () => {
  it('should refuse an id that does not exist for the chapter with WSN_001', async () => {
    const { db } = fakeDb();
    const svc = service(db);

    await expect(svc.get(7n, 5, 999n)).rejects.toMatchObject({ code: 'WSN_001' });
  });
});
