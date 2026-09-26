import { describe, expect, it, mock } from 'bun:test';
import { and, eq, isNull, ne, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { schema } from '@server/database';

import { selectLastRun } from '@modules/ai/tools/tools/get-usage.tool';
import { ToolRegistryService } from '@modules/ai/tools/tool-registry.service';
import { type ToolContext } from '@modules/ai/tools/types';
import { hashReviewedBody } from '@modules/review/review-findings';

const dialect = new PgDialect();

function ctxWith(overrides: { query?: Record<string, unknown>; select?: () => unknown }, runId = 'run-1'): ToolContext {
  return {
    chapter: null,
    db: { query: overrides.query ?? {}, select: overrides.select } as never,
    node: 'chat-hub',
    projectId: 1n,
    retrieval: {} as never,
    runId,
  };
}

function hubTool(name: string) {
  const tool = new ToolRegistryService().getRaw('chat-hub').find(candidate => candidate.name === name);
  if (!tool) throw new Error(`${name} is not a chat-hub lookup`);
  return tool;
}

function selectChain(rows: unknown[], wheres: SQL[] = []) {
  return () => ({ from: () => ({ where: (where: SQL) => (wheres.push(where), { groupBy: () => Promise.resolve(rows) }) }) });
}

describe('selectLastRun', () => {
  const runs = [
    { id: 'run-current', parentRunId: null, startedAt: new Date('2026-01-03') },
    { id: 'run-current-title', parentRunId: 'run-current', startedAt: new Date('2026-01-03T00:00:01Z') },
    { id: 'run-prev', parentRunId: null, startedAt: new Date('2026-01-02') },
    { id: 'run-prev-title', parentRunId: 'run-prev', startedAt: new Date('2026-01-02T00:00:01Z') },
  ];

  it('should exclude the run in progress even though it is the most recent', () => {
    expect(selectLastRun(runs, 'run-current')?.id).toBe('run-prev');
  });

  it('should never pick a child run (a chat-title or chat-compact pass) as the last run on its own', () => {
    expect(selectLastRun(runs, 'run-current')?.id).not.toBe('run-current-title');
    expect(selectLastRun(runs, 'run-current')?.id).not.toBe('run-prev-title');
  });

  it('should count an earlier chat turn as a run', () => {
    const turns = [
      { id: 'turn-2', parentRunId: null, startedAt: new Date('2026-01-02') },
      { id: 'turn-1', parentRunId: null, startedAt: new Date('2026-01-01') },
    ];
    expect(selectLastRun(turns, 'turn-3')?.id).toBe('turn-2');
  });

  it('should return null when nothing else qualifies', () => {
    expect(selectLastRun([{ id: 'run-current', parentRunId: null, startedAt: new Date() }], 'run-current')).toBeNull();
  });
});

describe('get_usage', () => {
  it('should be a chat-hub lookup only', () => {
    const registry = new ToolRegistryService();

    expect(registry.getRaw('chat-hub').map(tool => tool.name)).toContain('get_usage');
    expect(registry.getRaw('judge').map(tool => tool.name)).not.toContain('get_usage');
  });

  it('should report calls, tokens, cost and duration with a per-role breakdown, and no prompt or answer content', async () => {
    const rows = [
      {
        role: 'chat',
        model: 'gpt',
        status: 'ok',
        costSource: 'gateway',
        calls: 1,
        inputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 200,
        latencyMs: 900,
        recordedCostUsd: 0.3,
        unpricedInputTokens: 0,
        unpricedOutputTokens: 0,
      },
      {
        role: 'review',
        model: 'gpt',
        status: 'ok',
        costSource: 'gateway',
        calls: 1,
        inputTokens: 500,
        cachedInputTokens: 0,
        outputTokens: 100,
        latencyMs: 600,
        recordedCostUsd: 0.1,
        unpricedInputTokens: 0,
        unpricedOutputTokens: 0,
      },
    ];
    const ctx = ctxWith({ select: selectChain(rows) });

    const result = String(await hubTool('get_usage').handler({}, ctx));

    expect(result).toContain('2 calls');
    expect(result).toContain('1,800 tokens');
    expect(result).toContain('$0.40');
    expect(result).toContain('1.5s total');
    expect(result).toContain('Fully recorded');
    expect(result).toContain('By role:');
    expect(result).toContain('- chat: 1 calls, $0.30');
    expect(result).toContain('- review: 1 calls, $0.10');
    expect(result).not.toMatch(/prompt|answer/i);
  });

  it('should scope the report to a chapter', async () => {
    const rows = [
      {
        role: 'chat',
        model: 'gpt',
        status: 'ok',
        costSource: 'gateway',
        calls: 1,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 20,
        latencyMs: 100,
        recordedCostUsd: 0.05,
        unpricedInputTokens: 0,
        unpricedOutputTokens: 0,
      },
    ];
    const ctx = ctxWith({ select: selectChain(rows) });

    const result = String(await hubTool('get_usage').handler({ chapter: 3 }, ctx));

    expect(result).toStartWith('Usage for chapter 3, all time');
  });

  it('should label "today" as the last 24 hours', async () => {
    const ctx = ctxWith({ select: selectChain([]) });

    const result = String(await hubTool('get_usage').handler({ period: 'today' }, ctx));

    expect(result).toBe('No usage recorded for the last 24 hours.');
  });

  it('should build a `>=` clause on `created_at` for a non-today, non-"all" period', async () => {
    const wheres: SQL[] = [];
    const ctx = ctxWith({ select: selectChain([], wheres) });

    await hubTool('get_usage').handler({ period: 'week' }, ctx);

    expect(wheres).toHaveLength(1);
    const rendered = dialect.sqlToQuery(wheres[0] as SQL);
    expect(rendered.sql).toMatch(/"created_at" >= \$\d+/);
  });

  it('should build no date clause for period "all"', async () => {
    const wheres: SQL[] = [];
    const ctx = ctxWith({ select: selectChain([], wheres) });

    await hubTool('get_usage').handler({ period: 'all' }, ctx);

    const rendered = dialect.sqlToQuery(wheres[0] as SQL);
    expect(rendered.sql).not.toContain('created_at');
  });

  it('should flag a figure that includes an estimated call', async () => {
    const rows = [
      {
        role: 'chat',
        model: 'gpt-4o-mini',
        status: 'ok',
        costSource: 'estimate',
        calls: 1,
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 20,
        latencyMs: 100,
        recordedCostUsd: 0.01,
        unpricedInputTokens: 0,
        unpricedOutputTokens: 0,
      },
    ];
    const ctx = ctxWith({ select: selectChain(rows) });

    const result = String(await hubTool('get_usage').handler({}, ctx));

    expect(result).toContain('estimated');
  });

  it('should resolve "the last run" to the author\'s previous run and its children, excluding the run in progress', async () => {
    const workflowRuns = {
      findFirst: mock(async () => ({ id: 'run-prev' })),
      findMany: mock(async () => [{ id: 'run-prev-title' }]),
    };
    const rows = [
      {
        role: 'chat',
        model: 'gpt',
        status: 'ok',
        costSource: 'gateway',
        calls: 1,
        inputTokens: 10,
        cachedInputTokens: 0,
        outputTokens: 5,
        latencyMs: 50,
        recordedCostUsd: 0.02,
        unpricedInputTokens: 0,
        unpricedOutputTokens: 0,
      },
    ];
    const ctx = ctxWith({ query: { workflowRuns }, select: selectChain(rows) }, 'run-1');

    const result = String(await hubTool('get_usage').handler({ last_run: true }, ctx));

    expect(result).toContain('the last run');
    expect(workflowRuns.findFirst).toHaveBeenCalledTimes(1);
    expect(workflowRuns.findMany).toHaveBeenCalledTimes(1);
  });

  it('should exclude the run in progress from "the last run" query, and never load more than its id', async () => {
    let capturedQuery: { where?: (table: typeof schema.workflowRuns, ops: Record<string, unknown>) => SQL; columns?: Record<string, boolean> } | undefined;
    const workflowRuns = {
      findFirst: mock(async (query: typeof capturedQuery) => {
        capturedQuery = query;
        return undefined;
      }),
    };
    const ctx = ctxWith({ query: { workflowRuns } }, 'run-1');

    const result = String(await hubTool('get_usage').handler({ last_run: true }, ctx));

    expect(result).toBe('No earlier run recorded yet.');
    expect(capturedQuery?.columns).toEqual({ id: true });
    const where = capturedQuery?.where?.(schema.workflowRuns, { and, eq, isNull, ne });
    const rendered = dialect.sqlToQuery(where as SQL);
    expect(rendered.sql).toContain('is null');
    expect(rendered.sql).toMatch(/"id" <> \$\d+/);
    expect(rendered.params).toContain('run-1');
  });

  it('should say when no earlier run has been recorded', async () => {
    const ctx = ctxWith({ query: { workflowRuns: { findFirst: mock(async () => undefined) } } }, 'run-1');

    const result = String(await hubTool('get_usage').handler({ last_run: true }, ctx));

    expect(result).toBe('No earlier run recorded yet.');
  });
});

describe('get_review', () => {
  it('should be a chat-hub lookup only', () => {
    const registry = new ToolRegistryService();

    expect(registry.getRaw('chat-hub').map(tool => tool.name)).toContain('get_review');
    expect(registry.getRaw('judge').map(tool => tool.name)).not.toContain('get_review');
  });

  const body = 'The lamplighter reaches the sealed door.';
  const bodyHash = hashReviewedBody(body);

  function review(overrides: Record<string, unknown> = {}) {
    return {
      id: 1n,
      kind: 'judge',
      disposition: 'issues',
      verdict: 'revision_requested',
      note: 'Watch the pacing in act two.',
      findings: [
        {
          id: 'f1',
          severity: 'blocking',
          category: 'continuity',
          text: 'Mira is in two places at once.',
          evidence: 'Mira stood at the harbour and at the tower.',
          fingerprint: 'fp1',
        },
      ],
      checked: ['continuity', 'ending contract'],
      briefCompliance: { compliant: false, issues: ['missed the ending beat'] },
      readabilityCompliance: null,
      endingCompliance: null,
      knowledgeCompliance: null,
      isolated: false,
      draftRevision: 2,
      bodyHash,
      createdAt: new Date(),
      remedies: [],
      ...overrides,
    };
  }

  // The tool issues one findFirst per kind, in the fixed KIND_ORDER (judge, editorial, mechanics, readability) when unfiltered,
  // or a single call for one kind when `kind` is given — `rowsInOrder` supplies each call's result in that same call order.
  function reviewCtx(rowsInOrder: readonly (unknown | undefined)[], draftRevision = 2, draftIsolated = false, draftBody = body) {
    let call = 0;
    return ctxWith({
      query: {
        chapterReviews: { findFirst: mock(async () => rowsInOrder[call++]) },
        drafts: { findFirst: mock(async () => ({ revision: draftRevision, body: draftBody, isolated: draftIsolated })) },
        chapters: { findFirst: mock(async () => undefined) },
      },
    });
  }

  it('should return disposition, findings, checked and the author’s remedy for the current revision', async () => {
    const remedy = { findingId: 'f1', action: 'dismissed', reason: 'already fine' };
    const ctx = reviewCtx([review({ remedies: [remedy] })]);

    const result = String(await hubTool('get_review').handler({ chapter: 5, kind: 'judge' }, ctx));

    expect(result).toContain('**judge review** — issues (revision_requested)');
    expect(result).toContain('revision 2 (current)');
    expect(result).toContain('[blocking] Mira is in two places at once.');
    expect(result).toContain('evidence: "Mira stood at the harbour and at the tower."');
    expect(result).toContain('remedy: dismissed — already fine');
    expect(result).toContain('Checked: continuity, ending contract');
    expect(result).toContain('Brief compliance: not compliant — missed the ending beat');
  });

  it('should mark a review as stale against a newer revision', async () => {
    const ctx = reviewCtx([review()], 3);

    const result = String(await hubTool('get_review').handler({ chapter: 5, kind: 'judge' }, ctx));

    expect(result).toContain('stale, the chapter is now at revision 3');
  });

  it('should redact findings, evidence, remedy reasons and compliance issues for an isolated review', async () => {
    const remedy = { findingId: 'f1', action: 'dismissed', reason: 'already fine' };
    const ctx = reviewCtx([review({ isolated: true, remedies: [remedy] })]);

    const result = String(await hubTool('get_review').handler({ chapter: 5, kind: 'judge' }, ctx));

    expect(result).toContain('walled off');
    expect(result).toContain('[withheld: isolated chapter]');
    expect(result).toContain('remedy: dismissed');
    expect(result).not.toContain('Mira is in two places at once.');
    expect(result).not.toContain('Mira stood at the harbour and at the tower.');
    expect(result).not.toContain('missed the ending beat');
    expect(result).toContain('issues walled off');
    expect(result).not.toContain('already fine');
    expect(result).not.toContain('Watch the pacing in act two.');
  });

  it('should redact a non-isolated review when the chapter’s current draft is isolated', async () => {
    const ctx = reviewCtx([review({ isolated: false })], 2, true);

    const result = String(await hubTool('get_review').handler({ chapter: 5, kind: 'judge' }, ctx));

    expect(result).toContain('walled off');
    expect(result).not.toContain('Mira is in two places at once.');
    expect(result).not.toContain('Mira stood at the harbour and at the tower.');
  });

  it('should still redact when the chapter’s current draft is isolated but blank — isolation is read independently of the body', async () => {
    const ctx = reviewCtx([review({ isolated: false })], 2, true, '');

    const result = String(await hubTool('get_review').handler({ chapter: 5, kind: 'judge' }, ctx));

    expect(result).toContain('walled off');
    expect(result).not.toContain('Mira is in two places at once.');
    expect(result).not.toContain('Mira stood at the harbour and at the tower.');
    expect(result).toContain('the chapter no longer has a reviewable text');
  });

  it('should filter to the requested kind', async () => {
    const ctx = reviewCtx([review({ kind: 'mechanics', findings: [], checked: ['pacing'] })]);

    const result = String(await hubTool('get_review').handler({ chapter: 5, kind: 'mechanics' }, ctx));

    expect(result).toContain('**mechanics review**');
    expect(result).toContain('No findings.');
  });

  it('should degrade gracefully when nothing was reviewed', async () => {
    const ctx = reviewCtx([]);

    const result = String(await hubTool('get_review').handler({ chapter: 9 }, ctx));

    expect(result).toBe('No review recorded for chapter 9.');
  });
});
