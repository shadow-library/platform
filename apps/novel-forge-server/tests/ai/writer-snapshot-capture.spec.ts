import { describe, expect, it } from 'bun:test';

import { PRODUCTION_DEFAULTS, UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { createChapterGenerationNodes } from '@modules/ai/graphs/chapter-generation.graph';

import { writerAssembler, writerDb, writerTables } from './writer-disclosure-fixtures';

type Row = Record<string, unknown>;
interface Message {
  role: string;
  content: string;
}
interface ModelRoute {
  provider: string;
  model: string;
}

interface CapturedSnapshot {
  meta: { role: string; attempt: number; draftRevision: number; chapter: number; isolated: boolean; promptKey: string };
  messages: Message[];
  modelRoute: ModelRoute;
}

const ROUTE: ModelRoute = { provider: 'openrouter', model: 'test-writer-model' };
const POLICY = { writerClass: 'standard', raised: false, contextSections: [] };
const LONG_BODY = 'The tide came in slowly and the keeper counted the ships twice. '.repeat(200);

function fakeWriterSnapshots() {
  const captured: CapturedSnapshot[] = [];
  return {
    captured,
    service: {
      onMessages: (meta: CapturedSnapshot['meta']) => {
        let called = false;
        return (messages: Message[], modelRoute: ModelRoute) => {
          if (called) return;
          called = true;
          captured.push({ meta, messages, modelRoute });
        };
      },
    },
  };
}

/** A router that hands `ctx.onMessages` a plain, already-"serialized" message pair keyed by the prompt it answered. */
function fakeRouter(reply: (key: string) => unknown) {
  return {
    structured: async (prompt: { key: string }, _vars: unknown, ctx: { onMessages?: (messages: Message[], route: ModelRoute) => void }) => {
      ctx.onMessages?.(
        [
          { role: 'system', content: `SYSTEM:${prompt.key}` },
          { role: 'human', content: `HUMAN:${prompt.key}` },
        ],
        ROUTE,
      );
      return reply(prompt.key);
    },
    resolveFor: async (role: string, project?: { contentMode?: string }) =>
      project?.contentMode === 'unrestricted' ? UNRESTRICTED_DEFAULTS[role as 'generation'] : PRODUCTION_DEFAULTS[role as 'generation'],
  };
}

function graph(rows: Map<string, Row[]>, reply: (key: string) => unknown) {
  const db = writerDb(rows);
  const { service: writerSnapshots, captured } = fakeWriterSnapshots();
  const nodes = createChapterGenerationNodes({
    db: db as never,
    contextAssembler: writerAssembler(db),
    modelRouter: fakeRouter(reply) as never,
    telemetry: {} as never,
    toolRegistry: {} as never,
    indexingService: {} as never,
    pluginPolicy: { scoped: async () => ({ for: () => POLICY, forPack: () => POLICY }) } as never,
    writerSnapshots: writerSnapshots as never,
  });
  return { nodes, captured };
}

const draftReply = (key: string): unknown => (key === 'fix' ? { action: 'rewrite', body: LONG_BODY } : { title: 'Low Water', body: LONG_BODY, summary: 'Done.', state: {} });

describe('writer attempt snapshots — capture at the chapter-generation graph', () => {
  it('should capture a draft attempt with the exact messages the fake router received', async () => {
    const { nodes, captured } = graph(writerTables('locked'), draftReply);
    const state = { projectId: '7', chapter: 5, runId: 'run-1', guidance: '', attempt: 0, findings: [], knowledgeWriterFindings: [], mechanicalFindings: [] };

    const assembled = await nodes.assembleContext(state as never);
    await nodes.draftChapter({ ...state, ...assembled } as never);

    expect(captured).toHaveLength(1);
    expect(captured[0]?.meta.role).toBe('draft');
    expect(captured[0]?.meta.attempt).toBe(0);
    expect(captured[0]?.meta.chapter).toBe(5);
    expect(captured[0]?.meta.isolated).toBe(false);
    expect(captured[0]?.modelRoute).toEqual(ROUTE);
    expect(captured[0]?.messages).toEqual([
      { role: 'system', content: 'SYSTEM:generation' },
      { role: 'human', content: 'HUMAN:generation' },
    ]);
  });

  it('should capture a repair attempt as its own row, distinct from the draft it repairs', async () => {
    const { nodes, captured } = graph(writerTables('locked'), draftReply);
    const state = { projectId: '7', chapter: 5, runId: 'run-1', guidance: '', attempt: 0, findings: [], knowledgeWriterFindings: [], mechanicalFindings: [] };
    const assembled = await nodes.assembleContext(state as never);
    const drafted = await nodes.draftChapter({ ...state, ...assembled } as never);

    await nodes.repairPatch({ ...state, ...assembled, ...drafted, findings: [{ severity: 'hard', text: 'The pier was burned.' }] } as never);

    expect(captured).toHaveLength(2);
    expect(captured.map(row => row.meta.role)).toEqual(['draft', 'repair']);
    expect(captured[1]?.meta.attempt).toBe(1);
    expect(captured[1]?.messages).toEqual([
      { role: 'system', content: 'SYSTEM:fix' },
      { role: 'human', content: 'HUMAN:fix' },
    ]);
  });

  it('should capture a rewrite attempt when the fix ladder falls back to a full rewrite', async () => {
    const { nodes, captured } = graph(writerTables('locked'), draftReply);
    const state = { projectId: '7', chapter: 5, runId: 'run-1', guidance: '', attempt: 0, findings: [], knowledgeWriterFindings: [], mechanicalFindings: [] };
    const assembled = await nodes.assembleContext(state as never);
    const drafted = await nodes.draftChapter({ ...state, ...assembled } as never);

    await nodes.repairRewrite({ ...state, ...assembled, ...drafted } as never);

    expect(captured).toHaveLength(2);
    expect(captured.map(row => row.meta.role)).toEqual(['draft', 'rewrite']);
    expect(captured[1]?.meta.attempt).toBe(1);
  });

  it("should mark an isolated chapter's attempt captured as isolated, so its Writer's view walls off later", async () => {
    const rows = writerTables('locked');
    rows.set(
      'briefs',
      (rows.get('briefs') ?? []).map(brief => ({ ...brief, contentMode: 'unrestricted' })),
    );
    const { nodes, captured } = graph(rows, draftReply);
    const state = { projectId: '7', chapter: 5, runId: 'run-1', guidance: '', attempt: 0, findings: [], knowledgeWriterFindings: [], mechanicalFindings: [] };

    const assembled = await nodes.assembleContext(state as never);
    await nodes.draftChapter({ ...state, ...assembled } as never);

    expect(captured[0]?.meta.isolated).toBe(true);
  });
});
