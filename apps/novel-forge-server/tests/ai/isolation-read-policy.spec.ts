import { beforeAll, describe, expect, it } from 'bun:test';

import { type BaseMessage } from '@langchain/core/messages';

import { PRODUCTION_DEFAULTS, UNRESTRICTED_DEFAULTS } from '@modules/ai/defaults';
import { createChapterGenerationNodes } from '@modules/ai/graphs/chapter-generation.graph';
import {
  ISOLATED_EXTRACTION_NOTE,
  NO_APPROVED_BRIDGE,
  standardReadableDraft,
  standardReadableExtraction,
  standardReadableProse,
  standardReadableState,
  WALLED_OFF_EXCERPT,
} from '@modules/ai/isolation-read-policy';
import { ToolRegistryService } from '@modules/ai/tools/tool-registry.service';
import { type ToolContext } from '@modules/ai/tools/types';
import { ScopedPluginHostFactory } from '@modules/plugins/plugin-host.service';
import { hashReviewedBody } from '@modules/review/review-findings';
import { schema } from '@server/database';

import { bridgeSelect } from '../finalize-review/bridge-fixtures';
import { draftRow, fakeGenerationDb, makeGenerationService } from '../generation/generation-fixtures';
import { writerAssembler, writerDb, writerTables } from './writer-disclosure-fixtures';

const MARKER = 'ISOLATED_MARKER';
const ISOLATED_PROSE = `${MARKER} walks the flooded cellar alone.`;
const BRIDGE = 'The keeper spent the night in the cellar and came back changed.';
const RAW_SUMMARY = `${MARKER} spent the night in the cellar, as the unrestricted writer told it.`;
const POSITIONS = [{ entityKey: 'keeper', location: 'the north pier', conditions: [] }];
const ISOLATED_STATE = {
  characterPositions: [...POSITIONS, { entityKey: 'stranger', location: 'the cellar' }, { entityKey: 'apprentice', location: `${MARKER} ${'far '.repeat(20)}` }],
  lastBeat: `${MARKER} closes the cellar door.`,
  openConflict: MARKER,
  establishedFacts: [`${MARKER} is soaked.`],
};

/** The finalize review of chapter 4's current text, with its bridge summary and one position approved and one position left unanswered. */
function approvedReview(body = ISOLATED_PROSE): Row {
  const item = (itemKey: string, proposed: Row, decision: string | null): Row => ({ itemKey, category: proposed['category'], proposed, edited: null, decision });
  return {
    id: 40n,
    projectId: 7n,
    chapter: 4,
    draftRevision: 1,
    sourceHash: hashReviewedBody(body),
    isolated: true,
    bridgeOnly: false,
    status: 'applied',
    items: [
      item('summary', { category: 'summary', text: BRIDGE }, 'kept'),
      item('character_state:keeper', { category: 'character_state', state: { entityKey: 'keeper', location: 'the north pier', evidence: WALLED_OFF_EXCERPT } }, 'kept'),
      item('character_state:apprentice', { category: 'character_state', state: { entityKey: 'apprentice', location: MARKER, evidence: WALLED_OFF_EXCERPT } }, null),
    ],
  };
}
const SHORT_BODY = 'The tide came in slowly. '.repeat(20);
const LONG_BODY = 'The tide came in slowly. '.repeat(900);
const POLICY = { writerClass: 'standard', raised: false, contextSections: [], systemMessages: [] };

interface RecordedCall {
  node: string;
  contentMode: string;
  payload: string;
}

type Row = Record<string, unknown>;

/** Chapter 4 is isolated: its prose, its free-text state and its judge note all carry the marker. Chapter 5 is planned with `mode5`. */
function tables(mode5: 'standard' | 'unrestricted' | null = null): Map<string, Row[]> {
  const rows = writerTables('locked');
  rows.set(
    'chapters',
    (rows.get('chapters') ?? []).map(chapter => (chapter['number'] === 4 ? { ...chapter, isolated: true, content: ISOLATED_PROSE, summary: RAW_SUMMARY, title: MARKER } : chapter)),
  );
  const draft = (chapter: number, extra: Row): Row => ({ id: BigInt(chapter), projectId: 7n, chapter, revision: 1, staleReason: null, ...extra });
  rows.set('finalizeReviews', [approvedReview()]);
  rows.set('drafts', [
    draft(4, { status: 'final', body: ISOLATED_PROSE, summary: RAW_SUMMARY, title: MARKER, isolated: true, state: ISOLATED_STATE, judgeNote: `[soft] ${MARKER}` }),
    draft(5, { status: 'draft', body: 'The pier creaks under the morning tide.', summary: 'Morning.', isolated: false, state: null, judgeNote: null }),
  ]);
  rows.set(
    'briefs',
    (rows.get('briefs') ?? []).map(brief => ({ ...brief, contentMode: mode5 })),
  );
  return rows;
}

function recordingRouter(calls: RecordedCall[], extracted?: unknown) {
  let drafts = 0;
  const answer = (key: string): unknown => {
    if (extracted && key === 'continuity') return extracted;
    if (key === 'fix') return { action: 'rewrite', body: LONG_BODY };
    if (key === 'chapter-expand') return { body: LONG_BODY };
    if (key === 'title') return { title: 'Low Water' };
    if (key === 'continuity') return { newEntities: [], relationships: [], characterStates: [] };
    if (key === 'chapter-extract') return { summary: 'Canon.', changeSet: [{ op: 'entity.upsert', entityKey: 'keeper' }] };
    drafts += 1;
    return { title: drafts === 1 ? '' : 'Low Water', body: SHORT_BODY, summary: 'Done.', state: {} };
  };
  const judgeAnswer = JSON.stringify({
    verdict: 'contradiction',
    findings: [{ severity: 'hard', text: 'The pier was burned.' }],
    briefCompliance: { compliant: true, issues: [] },
  });
  return {
    structured: async (prompt: { key: string }, vars: Record<string, unknown>, _ctx: unknown, project?: { contentMode?: string }) => {
      calls.push({ node: prompt.key, contentMode: project?.contentMode ?? 'standard', payload: JSON.stringify(vars) });
      return answer(prompt.key);
    },
    chatFor: async (role: string, _ctx: unknown, project?: { contentMode?: string }) => ({
      invoke: async (messages: BaseMessage[]) => {
        calls.push({ node: role, contentMode: project?.contentMode ?? 'standard', payload: JSON.stringify(messages.map(message => message.content)) });
        return { content: judgeAnswer, _getType: () => 'ai', getType: () => 'ai' };
      },
    }),
    screenOutput: async () => undefined,
    resolveModel: (role: string, project?: { contentMode?: string }) =>
      project?.contentMode === 'unrestricted' ? UNRESTRICTED_DEFAULTS[role as 'generation'] : PRODUCTION_DEFAULTS[role as 'generation'],
  };
}

function expectNoStandardCallReads(calls: RecordedCall[]): void {
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.filter(call => call.contentMode !== 'unrestricted' && call.payload.includes(MARKER)).map(call => call.node)).toEqual([]);
}

const permissiveFor = (baseline?: { contentMode?: string | null }) => ({ ...POLICY, writerClass: baseline?.contentMode === 'unrestricted' ? 'permissive' : 'standard' });

function graph(mode5: 'standard' | 'unrestricted' | null) {
  const calls: RecordedCall[] = [];
  const db = writerDb(tables(mode5));
  const nodes = createChapterGenerationNodes({
    db: db as never,
    contextAssembler: writerAssembler(db),
    modelRouter: recordingRouter(calls) as never,
    telemetry: {} as never,
    toolRegistry: { forNode: () => [], getRaw: () => [] } as never,
    indexingService: {} as never,
    pluginPolicy: {
      scoped: async (_projectId: bigint, baseline?: { contentMode?: string }) => {
        const policy = permissiveFor(baseline);
        return { for: () => policy, forPack: () => policy };
      },
    } as never,
    writerSnapshots: { onMessages: () => () => {} } as never,
  });
  return { nodes, calls };
}

// The ladder assembles a full pack, so each mode runs it once and the tests below read what the fake router recorded.
async function runLadder(mode5: 'standard' | 'unrestricted' | null) {
  const { nodes, calls } = graph(mode5);
  const run = { projectId: '7', chapter: 5, runId: 'run-1', guidance: '', findings: [], knowledgeWriterFindings: [], mechanicalFindings: [] };
  const assembled = await nodes.assembleContext(run as never);
  const state = { ...run, ...assembled };
  const drafted = await nodes.draftChapter(state as never);
  await nodes.judge({ ...state, ...drafted } as never);
  await nodes.repairPatch({ ...state, ...drafted, findings: [{ severity: 'hard', text: 'The pier was burned.' }] } as never);
  await nodes.repairRewrite({ ...state, ...drafted } as never);
  return { contentMode: assembled.contentMode, calls };
}

function service(calls: RecordedCall[], rows = tables(), extracted?: unknown, draftReads = [draftRow({ chapter: 5, body: 'The pier creaks under the morning tide.' })]) {
  const fake = fakeGenerationDb({ draftReads, draftWriteResult: [draftRow({ chapter: 5 })] });
  const insert = (table: unknown) => {
    const recorded = (fake.db as unknown as { insert: (into: unknown) => { values: (values: Record<string, unknown>) => unknown } }).insert(table);
    if (table !== schema.continuityProposals) return recorded;
    return {
      values: (values: Record<string, unknown>) => {
        recorded.values(values);
        return { onConflictDoUpdate: () => ({ returning: async () => [{ id: 1n, ...values }] }) };
      },
    };
  };
  const db = { ...fake.db, query: writerDb(rows).query, insert };
  const staged: unknown[] = [];
  const generation = makeGenerationService(db, {
    modelRouter: recordingRouter(calls, extracted),
    contextAssembler: writerAssembler(writerDb(rows)),
    pluginPolicy: { resolve: async (_projectId: bigint, _call: unknown, baseline?: { contentMode?: string }) => permissiveFor(baseline) },
    proposalService: {
      create: async (_projectId: bigint, proposal: unknown) => {
        staged.push(proposal);
        return { id: 1n };
      },
    },
  });
  return { generation, fake, staged };
}

describe('the chapter-generation graph on the standard chapter after an isolated one', () => {
  let ladder: Awaited<ReturnType<typeof runLadder>>;
  beforeAll(async () => {
    ladder = await runLadder(null);
  });

  it('should draft, expand, title, judge and repair on the standard route', () => {
    expect(ladder.contentMode).toBe('standard');
    expect(ladder.calls.map(call => [call.node, call.contentMode])).toEqual([
      ['generation', 'standard'],
      ['chapter-expand', 'standard'],
      ['title', 'standard'],
      ['judge', 'standard'],
      ['fix', 'standard'],
      ['generation', 'standard'],
      ['chapter-expand', 'standard'],
    ]);
  });

  it('should hand every call the bridge and the positions, never the prose, the free-text state or the judge note', () => {
    expectNoStandardCallReads(ladder.calls);
    expect(ladder.calls[0]?.payload).toContain(BRIDGE);
    expect(ladder.calls[0]?.payload).toContain('the north pier');
  });
});

describe('the chapter-generation graph on an unrestricted chapter', () => {
  let ladder: Awaited<ReturnType<typeof runLadder>>;
  beforeAll(async () => {
    ladder = await runLadder('unrestricted');
  });

  it('should run the same writer, judge and repair graph with every call on the unrestricted route', () => {
    expect(ladder.contentMode).toBe('unrestricted');
    expect(new Set(ladder.calls.map(call => call.contentMode))).toEqual(new Set(['unrestricted']));
    expect(ladder.calls.map(call => call.node)).toEqual(['generation', 'chapter-expand', 'title', 'judge', 'fix', 'generation', 'chapter-expand']);
  });
});

describe('an isolated chapter never reaches a standard call', () => {
  it('should summarize an isolated chapter only on the unrestricted route and revise the next one from its bridge', async () => {
    const calls: RecordedCall[] = [];
    const reads = [draftRow({ chapter: 4, status: 'final', isolated: true, body: ISOLATED_PROSE }), draftRow({ chapter: 5, body: 'The pier creaks under the morning tide.' })];
    const { generation } = service(calls, tables(), undefined, reads);

    await generation.summarizeChapter(7n, 4);
    await generation.reviseDraft(7n, 5, { note: 'Slow the opening.' });

    expect(calls.map(call => [call.node, call.contentMode])).toEqual([
      ['chapter-summarize', 'unrestricted'],
      ['revision', 'standard'],
    ]);
    expectNoStandardCallReads(calls);
  });

  it('should save a final isolated chapter’s summary, which only the author reads, instead of returning it for a draft save final chapters refuse', async () => {
    const calls: RecordedCall[] = [];
    const { generation, fake } = service(calls, tables(), undefined, [draftRow({ chapter: 4, status: 'final', isolated: true, body: ISOLATED_PROSE })]);

    const result = await generation.summarizeChapter(7n, 4);

    expect(result.saveSeq).toBeDefined();
    expect(fake.writesTo(schema.drafts).map(write => write.values?.['summary'])).toContain('Done.');
  });

  it('should extract continuity and canon from the standard chapter after it on the standard route, from the bridge', async () => {
    const calls: RecordedCall[] = [];
    const { generation } = service(calls);

    await generation.proposeContinuity(7n, 5);
    await generation.extractChapterToBible(7n, 5);

    expect(calls.map(call => [call.node, call.contentMode])).toEqual([
      ['continuity', 'standard'],
      ['chapter-extract', 'standard'],
    ]);
    expectNoStandardCallReads(calls);
  });

  it('should read an isolated chapter’s continuity on the unrestricted route and stage it with no excerpt left', async () => {
    const calls: RecordedCall[] = [];
    const excerpted = { relationships: [{ from: 'keeper', to: 'apprentice', evidence: ISOLATED_PROSE }], characterStates: [{ entityKey: 'keeper', evidence: ISOLATED_PROSE }] };
    const { generation, fake } = service(calls, tables(), excerpted);

    await generation.proposeContinuity(7n, 4);

    expect(calls.map(call => [call.node, call.contentMode])).toEqual([['continuity', 'unrestricted']]);
    const staged = JSON.stringify(fake.writesTo(schema.continuityProposals).map(write => write.values?.['proposal']));
    expect(staged).not.toContain(MARKER);
    expect(staged).toContain(WALLED_OFF_EXCERPT);
    expect(staged).toContain('"sourceIsolated":true');
    expect(calls[0]?.payload).toContain(ISOLATED_EXTRACTION_NOTE.split('\n')[0]);
  });

  it('should stage an isolated chapter’s canon extraction as a proposal marked isolated, which waits for the author', async () => {
    const calls: RecordedCall[] = [];
    const { generation, staged } = service(calls);

    await generation.extractChapterToBible(7n, 4);

    expect(calls.map(call => [call.node, call.contentMode])).toEqual([['chapter-extract', 'unrestricted']]);
    expect(staged).toEqual([expect.objectContaining({ kind: 'chapter_extract', sourceIsolated: true })]);
  });

  it('should give the chat its pack and lookups without the isolated prose', async () => {
    const db = writerDb(tables());
    const pack = await writerAssembler(db).forNovelChat(7n, new Date(0), { promptTokens: 4_000, requestTokens: 0 });
    const registry = new ToolRegistryService();
    const ctx: ToolContext = {
      chapter: null,
      node: 'chat-hub',
      projectId: 7n,
      runId: 'run-1',
      db: {
        query: {
          drafts: {
            findFirst: async () => ({
              chapter: 4,
              title: 'The Cellar',
              status: 'final',
              revision: 1,
              reviewStatus: 'approved',
              words: 10,
              isolated: true,
              body: ISOLATED_PROSE,
              summary: RAW_SUMMARY,
            }),
          },
        },
        select: bridgeSelect(() => ({ drafts: [{ chapter: 4, revision: 1, body: ISOLATED_PROSE }], reviews: [approvedReview()] })),
      } as never,
      retrieval: { searchProse: async () => [] } as never,
    };

    const draft = String(
      await registry
        .getRaw('chat-hub')
        .find(tool => tool.name === 'get_draft')
        ?.handler({ chapter: 4 }, ctx),
    );

    for (const text of [pack.rendered, draft]) expect(text).not.toContain(MARKER);
    expect(draft).toContain(BRIDGE);
  });

  it('should compose chapter art from the bridge, not the prose', async () => {
    const pack = await writerAssembler(writerDb(tables())).forIllustration(7n, 'chapter', '4');

    expect(pack.rendered).not.toContain(MARKER);
    expect(pack.rendered).toContain(BRIDGE);
  });

  it('should hand a plugin the bridge in place of an isolated draft’s prose, state and judge note', async () => {
    const row = { chapter: 4, revision: 1, isolated: true, body: ISOLATED_PROSE, summary: RAW_SUMMARY, state: ISOLATED_STATE, judgeNote: MARKER };
    const select = bridgeSelect(() => ({ drafts: [row], reviews: [approvedReview()], entities: [{ entityKey: 'keeper' }] }));
    const host = new ScopedPluginHostFactory({ getPostgresClient: () => ({ query: { drafts: { findFirst: async () => row } }, select }) } as never).create('plugin', 7n);

    const draft = await host.read.draft(4);

    expect(JSON.stringify(draft)).not.toContain(MARKER);
    expect(draft).toMatchObject({ summary: BRIDGE, state: { characterPositions: POSITIONS }, judgeNote: null });
  });

  it('should hand a plugin a walled-off draft once its text moved past the approved bridge', async () => {
    const row = { chapter: 4, revision: 2, isolated: true, body: `${ISOLATED_PROSE} Amended.`, summary: RAW_SUMMARY, state: ISOLATED_STATE, judgeNote: MARKER };
    const select = bridgeSelect(() => ({ drafts: [row], reviews: [approvedReview()], entities: [{ entityKey: 'keeper' }] }));
    const host = new ScopedPluginHostFactory({ getPostgresClient: () => ({ query: { drafts: { findFirst: async () => row } }, select }) } as never).create('plugin', 7n);

    const draft = await host.read.draft(4);

    expect(JSON.stringify(draft)).not.toContain(MARKER);
    expect(draft).toMatchObject({ summary: null, state: null, body: expect.stringContaining(NO_APPROVED_BRIDGE) });
  });
});

describe('standardReadableProse', () => {
  it('should pass a standard chapter’s prose through and replace an isolated one with its approved bridge summary', () => {
    expect(standardReadableProse({ isolated: false, body: 'Open prose.' }, null)).toBe('Open prose.');
    expect(standardReadableProse({ isolated: true, body: ISOLATED_PROSE }, BRIDGE)).toContain(BRIDGE);
    expect(standardReadableProse({ isolated: true, body: ISOLATED_PROSE }, null)).toContain(NO_APPROVED_BRIDGE);
    expect(standardReadableProse({ isolated: true, body: ISOLATED_PROSE }, null)).not.toContain(MARKER);
  });

  it('should leave a standard draft untouched', () => {
    const draft = { isolated: false, body: 'Open prose.', summary: null, chapter: 2 };
    expect(standardReadableDraft(draft, undefined)).toBe(draft);
  });
});

describe('standardReadableState', () => {
  it('should carry only the approved positions, and nothing without an approved bridge', () => {
    expect(standardReadableState({ positions: POSITIONS })).toEqual({ characterPositions: POSITIONS });
    expect(standardReadableState({ positions: [] })).toBeNull();
    expect(standardReadableState(undefined)).toBeNull();
  });
});

describe('standardReadableExtraction', () => {
  it('should withhold every excerpt, however deep, and keep the rest', () => {
    const extracted = { summary: 'Kept.', items: [{ evidence: MARKER, nested: { excerpt: MARKER, quote: MARKER, note: 'Kept too.' } }] };

    expect(standardReadableExtraction(extracted)).toEqual({
      summary: 'Kept.',
      items: [{ evidence: WALLED_OFF_EXCERPT, nested: { excerpt: WALLED_OFF_EXCERPT, quote: WALLED_OFF_EXCERPT, note: 'Kept too.' } }],
    });
  });
});
