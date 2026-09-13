import { SQL } from 'bun';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { createChapterTranslationGraph, renderAuditPairs, renderTermPolicy, routeAfterFidelity } from '@modules/ai/graphs/chapter-translation.graph';
import { WorkflowRunService } from '@modules/ai/graphs/workflow-run.service';
import { type PrimaryDatabase, type Translation } from '@server/database';
import * as schema from '@server/database/schemas';
import { noPluginPolicy } from '@tests/fixtures/plugin-policy';
import { createDatabaseFromTemplate } from '@tests/fixtures/template-db';

interface ScriptedCall {
  key: string;
  inputs: Record<string, unknown>;
}

const baseConnectionString = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
const dbName = `${baseConnectionString.split('/').pop()}_translation_graph`;

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(baseConnectionString);
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const PARAGRAPHS = ['叶凡站在青云宗的山门前，抬头望着天空。', '风从山谷里吹上来，带着松针和湿土的气味。', '他握紧了手中的剑，一步步走上石阶。'];
const ORIGINAL = PARAGRAPHS.join('\n\n');
const ORIGINAL_TITLE = '第一章 觉醒';

// The ratio checks are per-language heuristics; widening them keeps these specs about routing and
// persistence rather than about how long an invented English sentence happens to be.
const WIDE_BANDS: Translation.Settings = { fidelityBands: { lengthRatio: [0, 100], paragraphRatio: [0, 100] } };

const ENGLISH = [
  'Evan Ye stood before the mountain gate of the Azure Cloud Sect and looked up at the open air.',
  'Wind rose out of the valley, carrying pine needles and wet earth.',
  'He tightened his grip on the sword and climbed the stone steps.',
];

const fidelityIssue: Translation.Issue = { source: 'fidelity', type: 'number_drift', detail: 'x' };
const auditIssue: Translation.Issue = { source: 'audit', type: 'omission', detail: 'y', segmentIndex: 0 };

function buildServices(db: PrimaryDatabase, checkpointer: PostgresSaver, translateOutputs: unknown[], auditOutputs: unknown[], calls: ScriptedCall[]) {
  const modelRouter = {
    structured: async (promptModule: { key: string }, inputs: Record<string, unknown>) => {
      calls.push({ key: promptModule.key, inputs });
      if (promptModule.key === 'translate-chapter') return translateOutputs.shift();
      if (promptModule.key === 'translate-audit') return auditOutputs.shift();
      throw new Error(`unexpected prompt ${promptModule.key}`);
    },
  };
  const contextAssembler = {
    forTranslate: async () => ({
      id: null,
      rendered: 'STABLE-STYLE-NOTES\n\nVOLATILE-GLOSSARY-SLICE',
      renderedStable: 'STABLE-STYLE-NOTES',
      renderedVolatile: 'VOLATILE-GLOSSARY-SLICE',
    }),
  };
  return { db, contextAssembler, modelRouter, pluginPolicy: noPluginPolicy(), checkpointer } as never;
}

interface SeedOptions {
  settings?: Translation.Settings | null;
  styleNotes?: string | null;
}

async function seedProject(db: PrimaryDatabase, name: string, opts: SeedOptions = {}) {
  const [project] = await db.insert(schema.projects).values({ name, kind: 'translation', originalLanguage: 'zh' }).returning();
  if (!project) throw new Error('failed to seed project');
  await db.insert(schema.translations).values({
    projectId: project.id,
    styleNotes: opts.styleNotes === undefined ? 'Third person past tense, honorifics kept.' : opts.styleNotes,
    settings: opts.settings === undefined ? WIDE_BANDS : opts.settings,
  });
  const entries = await db
    .insert(schema.translationGlossary)
    .values([
      {
        projectId: project.id,
        sourceTerm: '叶凡',
        target: 'Evan Ye',
        category: 'character' as const,
        treatment: 'transliterate' as const,
        status: 'approved' as const,
        origin: 'seed' as const,
      },
      {
        projectId: project.id,
        sourceTerm: '天空',
        target: 'firmament',
        category: 'term' as const,
        treatment: 'translate' as const,
        status: 'rejected' as const,
        origin: 'seed' as const,
      },
    ])
    .returning();
  await db.insert(schema.chapters).values({ projectId: project.id, number: 1, originalTitle: ORIGINAL_TITLE, originalContent: ORIGINAL, status: 'done' });
  const approved = entries.find(entry => entry.sourceTerm === '叶凡');
  if (!approved) throw new Error('failed to seed glossary');
  return { projectId: project.id, approvedTermId: String(approved.id) };
}

const cleanAudit = { verdict: 'clean', issues: [] };

describe('routeAfterFidelity', () => {
  it('should persist when clean, repair once on the first dirty attempt, and persist after the budget', () => {
    expect(routeAfterFidelity({ fidelityIssues: [], auditIssues: [], attempt: 0, settings: {} })).toBe('persist');
    expect(routeAfterFidelity({ fidelityIssues: [fidelityIssue], auditIssues: [], attempt: 0, settings: {} })).toBe('repair');
    expect(routeAfterFidelity({ fidelityIssues: [], auditIssues: [auditIssue], attempt: 0, settings: {} })).toBe('repair');
    expect(routeAfterFidelity({ fidelityIssues: [fidelityIssue], auditIssues: [auditIssue], attempt: 1, settings: {} })).toBe('persist');
  });

  it('should honor settings.maxRepairs on both sides of the default', () => {
    expect(routeAfterFidelity({ fidelityIssues: [fidelityIssue], auditIssues: [], attempt: 1, settings: { maxRepairs: 2 } })).toBe('repair');
    expect(routeAfterFidelity({ fidelityIssues: [fidelityIssue], auditIssues: [], attempt: 2, settings: { maxRepairs: 2 } })).toBe('persist');
    expect(routeAfterFidelity({ fidelityIssues: [fidelityIssue], auditIssues: [], attempt: 0, settings: { maxRepairs: 0 } })).toBe('persist');
  });

  it('should clamp an unbounded maxRepairs so the run cannot outlive the graph recursion budget', () => {
    expect(routeAfterFidelity({ fidelityIssues: [fidelityIssue], auditIssues: [], attempt: 2, settings: { maxRepairs: 99 } })).toBe('repair');
    expect(routeAfterFidelity({ fidelityIssues: [fidelityIssue], auditIssues: [], attempt: 3, settings: { maxRepairs: 99 } })).toBe('persist');
  });
});

describe('renderTermPolicy', () => {
  it('should keep honorifics by default and switch the instruction when told to translate them', () => {
    expect(renderTermPolicy({})).toContain('keep source honorifics');
    expect(renderTermPolicy({ honorifics: 'keep' })).toContain('keep source honorifics');
    expect(renderTermPolicy({ honorifics: 'translate' })).toContain('English address');
  });

  it('should be byte-identical for equal settings so the cached stable segment does not churn', () => {
    expect(renderTermPolicy({ maxRepairs: 3 })).toBe(renderTermPolicy({ maxRepairs: 9 }));
  });
});

describe('renderAuditPairs', () => {
  it('should number the pairs 1-based and align each original with its translation', () => {
    const segments = [
      { index: 0, start: 0, end: 2, text: 'AA' },
      { index: 1, start: 2, end: 4, text: 'BB' },
    ];
    expect(renderAuditPairs(segments, ['aa', 'bb'])).toBe('### Segment 1\n[original]\nAA\n[translation]\naa\n\n### Segment 2\n[original]\nBB\n[translation]\nbb');
  });
});

describe.if(pgAvailable)('chapter-translation graph', () => {
  let db: PrimaryDatabase;
  let checkpointer: PostgresSaver;

  beforeAll(async () => {
    const url = await createDatabaseFromTemplate(dbName);
    db = drizzle(url, { schema }) as unknown as PrimaryDatabase;
    checkpointer = PostgresSaver.fromConnString(url);
    await checkpointer.setup();
  });

  // Leaving the pool open starves later spec files of connections and silently skips their suites.
  afterAll(() => (db as unknown as { $client: SQL }).$client.close());

  it('should translate a single-segment chapter and persist it as translated', async () => {
    const { projectId, approvedTermId } = await seedProject(db, `translation-graph-happy-${Date.now()}`);
    const calls: ScriptedCall[] = [];
    const body = ENGLISH.join('\n\n');
    const graph = createChapterTranslationGraph(buildServices(db, checkpointer, [{ title: 'Chapter One: Awakening', body }], [cleanAudit], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(state.outcome).toBe('translated');
    const translateCalls = calls.filter(c => c.key === 'translate-chapter');
    expect(translateCalls).toHaveLength(1);
    expect(translateCalls[0]?.inputs).toMatchObject({
      stableContext: 'STABLE-STYLE-NOTES',
      volatileContext: 'VOLATILE-GLOSSARY-SLICE',
      segmentIndex: 1,
      segmentCount: 1,
      sourceSegment: ORIGINAL,
      prevTranslatedTail: 'none',
      repairNotes: 'none',
    });
    expect(calls.filter(c => c.key === 'translate-audit')).toHaveLength(1);

    const row = await db.query.chapterTranslations.findFirst({
      where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, 1)),
    });
    expect(row).toMatchObject({
      title: 'Chapter One: Awakening',
      body,
      status: 'translated',
      issues: null,
      appliedTerms: { [approvedTermId]: 1 },
      glossaryStale: false,
      sourceStale: false,
      revision: 1,
      runId,
    });
    expect(row?.sourceHash).toBe(chapterContentHash({ title: ORIGINAL_TITLE, content: ORIGINAL }));
    expect(row?.segments).toEqual([{ sourceStart: 0, sourceEnd: ORIGINAL.length, body }]);
  });

  it('should call the model once per segment and feed each one the previous segment tail', async () => {
    const { projectId } = await seedProject(db, `translation-graph-multi-${Date.now()}`, { settings: { ...WIDE_BANDS, segmentTokens: 25 } });
    const calls: ScriptedCall[] = [];
    const outputs = [{ title: 'Awakening', body: ENGLISH[0] }, { body: ENGLISH[1] }, { body: ENGLISH[2] }];
    const graph = createChapterTranslationGraph(buildServices(db, checkpointer, outputs, [cleanAudit], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(state.outcome).toBe('translated');
    const translateCalls = calls.filter(c => c.key === 'translate-chapter');
    expect(translateCalls).toHaveLength(3);
    expect(translateCalls.map(c => c.inputs['segmentIndex'])).toEqual([1, 2, 3]);
    expect(translateCalls.map(c => c.inputs['sourceSegment'])).toEqual(PARAGRAPHS);
    expect(translateCalls[0]?.inputs['prevTranslatedTail']).toBe('none');
    expect(translateCalls[1]?.inputs['prevTranslatedTail']).toBe(ENGLISH[0]);
    expect(translateCalls[2]?.inputs['prevTranslatedTail']).toBe(ENGLISH[1]);

    const auditCall = calls.find(c => c.key === 'translate-audit');
    expect(String(auditCall?.inputs['pairs'])).toContain('### Segment 3');

    const row = await db.query.chapterTranslations.findFirst({
      where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, 1)),
    });
    expect(row?.body).toBe(ENGLISH.join('\n\n'));
    expect(row?.segments).toEqual([
      { sourceStart: 0, sourceEnd: 19, body: ENGLISH[0] as string },
      { sourceStart: 21, sourceEnd: 41, body: ENGLISH[1] as string },
      { sourceStart: 43, sourceEnd: 60, body: ENGLISH[2] as string },
    ]);
  });

  it('should repair only the segment an audit issue flags and persist the still-dirty chapter as attention', async () => {
    const { projectId } = await seedProject(db, `translation-graph-repair-${Date.now()}`, { settings: { ...WIDE_BANDS, segmentTokens: 25 } });
    const calls: ScriptedCall[] = [];
    const dirtyAudit = { verdict: 'issues', issues: [{ type: 'omission', segmentIndex: 2, detail: 'the wind is missing', excerpt: 'Wind rose' }] };
    const outputs = [{ title: 'Awakening', body: ENGLISH[0] }, { body: 'Wind rose.' }, { body: ENGLISH[2] }, { body: ENGLISH[1] }];
    const graph = createChapterTranslationGraph(buildServices(db, checkpointer, outputs, [dirtyAudit, dirtyAudit], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(state.outcome).toBe('attention');
    const translateCalls = calls.filter(c => c.key === 'translate-chapter');
    expect(translateCalls).toHaveLength(4);
    expect(calls.filter(c => c.key === 'translate-audit')).toHaveLength(2);

    const repairCall = translateCalls[3];
    expect(repairCall?.inputs['segmentIndex']).toBe(2);
    expect(repairCall?.inputs['sourceSegment']).toBe(PARAGRAPHS[1]);
    expect(repairCall?.inputs['prevTranslatedTail']).toBe(ENGLISH[0]);
    expect(String(repairCall?.inputs['repairNotes'])).toContain('(segment 2)');

    const row = await db.query.chapterTranslations.findFirst({
      where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, 1)),
    });
    expect(row?.status).toBe('attention');
    expect(row?.body).toBe(ENGLISH.join('\n\n'));
    // Persisted 0-based so the index addresses the row's own `segments` array; the model reports 1-based.
    expect(row?.issues).toEqual([{ source: 'audit', type: 'omission', detail: 'the wind is missing', excerpt: 'Wind rose', segmentIndex: 1 }]);
  });

  it('should re-translate every segment when a fidelity issue names none of them', async () => {
    const { projectId } = await seedProject(db, `translation-graph-fidelity-${Date.now()}`, { settings: { ...WIDE_BANDS, segmentTokens: 25, auditEnabled: false } });
    const calls: ScriptedCall[] = [];
    const outputs = [
      { title: 'Awakening', body: 'He stood before the mountain gate of the Azure Cloud Sect.' },
      { body: ENGLISH[1] },
      { body: ENGLISH[2] },
      { title: 'Awakening', body: ENGLISH[0] },
      { body: ENGLISH[1] },
      { body: ENGLISH[2] },
    ];
    const graph = createChapterTranslationGraph(buildServices(db, checkpointer, outputs, [], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(state.outcome).toBe('translated');
    const translateCalls = calls.filter(c => c.key === 'translate-chapter');
    expect(translateCalls).toHaveLength(6);
    expect(translateCalls.slice(3).map(c => c.inputs['segmentIndex'])).toEqual([1, 2, 3]);
    expect(String(translateCalls[3]?.inputs['repairNotes'])).toContain('glossary_violation');

    const row = await db.query.chapterTranslations.findFirst({
      where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, 1)),
    });
    expect(row).toMatchObject({ status: 'translated', issues: null, body: ENGLISH.join('\n\n') });
  });

  it('should merge a newly discovered term as suggested and drop one a rejected entry already covers', async () => {
    const { projectId } = await seedProject(db, `translation-graph-merge-${Date.now()}`);
    const calls: ScriptedCall[] = [];
    const outputs = [
      {
        title: 'Awakening',
        body: ENGLISH.join('\n\n'),
        discoveredTerms: [
          { sourceTerm: '青云宗', variants: ['青云'], target: 'Azure Cloud Sect', category: 'organization', treatment: 'translate', meaning: 'the sect at the mountain gate' },
          { sourceTerm: '天空', target: 'firmament', category: 'term', treatment: 'translate', meaning: 'the sky' },
        ],
      },
    ];
    const graph = createChapterTranslationGraph(buildServices(db, checkpointer, outputs, [cleanAudit], calls));

    const runId = randomUUID();
    await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } });

    const entries = await db.query.translationGlossary.findMany({ where: eq(schema.translationGlossary.projectId, projectId) });
    expect(entries).toHaveLength(3);
    expect(entries.find(entry => entry.sourceTerm === '青云宗')).toMatchObject({
      target: 'Azure Cloud Sect',
      variants: ['青云'],
      status: 'suggested',
      origin: 'discovered',
      createdChapter: 1,
    });
    expect(entries.filter(entry => entry.sourceTerm === '天空')).toHaveLength(1);
    expect(entries.find(entry => entry.sourceTerm === '天空')?.origin).toBe('seed');
  });

  it('should report a repeated discovered term once when a repair pass re-reports it', async () => {
    const { projectId } = await seedProject(db, `translation-graph-dedupe-${Date.now()}`, { settings: { ...WIDE_BANDS, segmentTokens: 25, auditEnabled: false } });
    const calls: ScriptedCall[] = [];
    // The discovered target never appears in the prose, so the scan flags it on both passes; the term is
    // reported twice, and only the accumulation-point dedupe keeps that from becoming two issues.
    const sect = { sourceTerm: '青云宗', target: 'Azure Cloud Sect', category: 'organization', treatment: 'translate', meaning: 'the sect at the mountain gate' };
    const opening = 'Evan Ye stood before the mountain gate and looked up at the open air.';
    const pass = [{ title: 'Awakening', body: opening, discoveredTerms: [sect] }, { body: ENGLISH[1] }, { body: ENGLISH[2] }];
    const graph = createChapterTranslationGraph(buildServices(db, checkpointer, [...pass, ...pass], [], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(state.outcome).toBe('attention');
    expect(calls.filter(c => c.key === 'translate-chapter')).toHaveLength(6);

    const row = await db.query.chapterTranslations.findFirst({
      where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, 1)),
    });
    expect(row?.issues).toHaveLength(1);
    expect(row?.issues?.[0]).toMatchObject({ source: 'fidelity', type: 'glossary_violation' });
  });

  it('should bump the revision and clear a previous failure when a row already exists', async () => {
    const { projectId } = await seedProject(db, `translation-graph-conflict-${Date.now()}`);
    const failedRunId = randomUUID();
    await db.insert(schema.chapterTranslations).values({
      projectId,
      chapter: 1,
      body: '',
      status: 'failed',
      lastError: 'model unreachable',
      lastFailedRunId: failedRunId,
    });

    const calls: ScriptedCall[] = [];
    const body = ENGLISH.join('\n\n');
    const graph = createChapterTranslationGraph(buildServices(db, checkpointer, [{ title: 'Awakening', body }], [cleanAudit], calls));

    const runId = randomUUID();
    await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } });

    const row = await db.query.chapterTranslations.findFirst({
      where: and(eq(schema.chapterTranslations.projectId, projectId), eq(schema.chapterTranslations.chapter, 1)),
    });
    expect(row).toMatchObject({ status: 'translated', body, revision: 2, runId });
    expect(row?.lastError).toBeNull();
    expect(row?.lastFailedRunId).toBeNull();

    // Only finalize writes canon; the translated prose must not have leaked into the chapter row.
    const chapter = await db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, 1)) });
    expect(chapter?.content).toBeNull();
    expect(chapter?.locked).toBe(false);
  });

  it('should skip the audit call when settings.auditEnabled is false', async () => {
    const { projectId } = await seedProject(db, `translation-graph-noaudit-${Date.now()}`, { settings: { ...WIDE_BANDS, auditEnabled: false } });
    const calls: ScriptedCall[] = [];
    const graph = createChapterTranslationGraph(buildServices(db, checkpointer, [{ title: 'Awakening', body: ENGLISH.join('\n\n') }], [], calls));

    const runId = randomUUID();
    const state = (await graph.invoke({ projectId: String(projectId), chapter: 1, runId }, { configurable: { thread_id: runId } })) as { outcome: string | null };

    expect(state.outcome).toBe('translated');
    expect(calls.filter(c => c.key === 'translate-audit')).toHaveLength(0);
  });

  it('should fail the run cleanly when the project has no style notes', async () => {
    const { projectId } = await seedProject(db, `translation-graph-unseeded-${Date.now()}`, { styleNotes: null });
    const calls: ScriptedCall[] = [];
    const services = buildServices(db, checkpointer, [], [], calls) as unknown as { contextAssembler: unknown; modelRouter: unknown; pluginPolicy: unknown };

    const workflowRuns = new WorkflowRunService(
      { getPostgresClient: () => db } as never,
      services.contextAssembler as never,
      services.modelRouter as never,
      {} as never,
      {} as never,
      {} as never,
      services.pluginPolicy as never,
      { publish: () => undefined } as never,
    );
    // The service builds its own saver from the app connection string; point it at this spec's clone.
    (workflowRuns as unknown as { checkpointer: PostgresSaver }).checkpointer = checkpointer;

    const result = await workflowRuns.runChapterTranslation({ projectId, chapter: 1 });

    expect(result).toMatchObject({ outcome: 'failed', status: 'failed' });
    expect(calls).toHaveLength(0);
    const run = await db.query.workflowRuns.findFirst({ where: eq(schema.workflowRuns.id, result.runId) });
    expect(run).toMatchObject({ graph: 'chapter-translation', target: 'chapter-1', status: 'failed' });
    expect(await db.query.chapterTranslations.findFirst({ where: eq(schema.chapterTranslations.projectId, projectId) })).toBeUndefined();
  });
});
