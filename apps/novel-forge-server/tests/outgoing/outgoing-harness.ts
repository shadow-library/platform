import { AIMessage, type BaseMessage, HumanMessage } from '@langchain/core/messages';
import { and, eq } from 'drizzle-orm';

import { CatalogService } from '@modules/ai/context/catalog.service';
import { ContextAssembler } from '@modules/ai/context/context-assembler.service';
import { createChapterGenerationNodes, mergeKnowledgeCompliance } from '@modules/ai/graphs/chapter-generation.graph';
import { ModelRouterService } from '@modules/ai/model-router.service';
import { buildChatRefinePrompt, chatScopeInstructions, renderTurnRules } from '@modules/ai/prompts';
import { ToolRegistryService } from '@modules/ai/tools/tool-registry.service';
import { serializeMessages, WriterSnapshotService } from '@modules/ai/writer-snapshot.service';
import { loadWriterDisclosurePolicy } from '@modules/bible/fact/writer-disclosure-policy';
import { passageHash } from '@modules/generation/passage-anchor';
import { PassageRewriteService } from '@modules/generation/passage-rewrite.service';
import { IllustrationService } from '@modules/illustration/illustration.service';
import { WriterPreviewService } from '@modules/refinement/writer-preview.service';
import { schema } from '@server/database';
import { type WriterSnapshotMessage } from '@server/database/schemas';

import { draftRow, fakeGenerationDb, makeGenerationService } from '../generation/generation-fixtures';
import { PROJECT_ID, type WorldDb, worldDb, type WorldSpec, worldTables } from './outgoing-world';

type Row = Record<string, unknown>;

const LONG_BODY = 'The tide came in slowly over the black stones. '.repeat(700);

const DRAFTED = { title: 'Low Water', body: LONG_BODY, summary: 'The keeper waits out the storm.', state: {} };

const ANSWERS: Record<string, unknown> = {
  generation: DRAFTED,
  revision: DRAFTED,
  'passage-rewrite': { replacement: 'The tide holds its breath.' },
  fix: { action: 'rewrite', body: LONG_BODY },
  'chat-refine': { reply: 'Noted.' },
  title: { title: 'Low Water' },
  'illustration-compose': { basePrompt: 'A lamp keeper on a wet pier at dusk, lantern raised.', subjectFraming: 'a bust portrait crop', styleNotes: 'ink wash, muted sea greens' },
};

export interface PluginSpec {
  section?: string;
  systemMessage?: string;
}

function policyOf(plugin: PluginSpec = {}): Row {
  return {
    writerClass: 'standard',
    raised: false,
    plugins: [],
    systemMessages: plugin.systemMessage ? [{ role: 'system', content: plugin.systemMessage }] : [],
    contextSections: plugin.section ? [{ key: 'plugin_notes', title: 'Coast notes', rendered: plugin.section, segment: 'volatile', minWriterClass: 'standard' }] : [],
    knobs: {},
    digest: '',
  };
}

/** Everything that left for a model in one call, and every stored record of it. */
export interface Outgoing {
  /** The messages exactly as the model client received them. */
  wire: WriterSnapshotMessage[];
  /** The first call's messages: a writer attempt's own call, which its snapshot records; follow-ups (expansion, title) come after it. */
  attempt: WriterSnapshotMessage[];
  /** Each call's messages, in the order the calls were made. */
  calls: WriterSnapshotMessage[][];
  /** The prompts an image model was asked to draw from, for an art call. */
  imagePrompts?: string[];
  /** The writer snapshot rows, every column, when the call is a writer attempt. */
  snapshots: Row[];
  /** Every string that left or was stored, for the forbidden/allowed checks. */
  texts: string[];
}

interface Capture {
  router: ModelRouterService;
  wire: BaseMessage[][];
}

function capturingRouter(): Capture {
  const wire: BaseMessage[][] = [];
  const db = { query: { llmCache: { findFirst: async () => undefined } }, insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }) };
  const router = new ModelRouterService(
    {} as never,
    { getPostgresClient: () => db } as never,
    { enforce: async () => undefined } as never,
    { defaultsFor: async () => undefined } as never,
  );
  let promptKey = '';
  const structured = router.structured.bind(router);
  router.structured = (prompt, ...rest) => {
    promptKey = prompt.key;
    return structured(prompt, ...rest);
  };
  (router as unknown as Record<string, unknown>)['buildClient'] = () => ({
    invoke: async (messages: BaseMessage[]) => {
      wire.push(messages);
      return { content: JSON.stringify(ANSWERS[promptKey] ?? {}) };
    },
  });
  return { router, wire };
}

function snapshotStore(): { service: WriterSnapshotService; rows: Row[] } {
  const rows: Row[] = [];
  const db = {
    insert: () => ({ values: async (values: Row) => void rows.push(values) }),
    delete: () => ({ where: async () => undefined }),
  };
  return { service: new WriterSnapshotService({ getPostgresClient: () => db } as never), rows };
}

const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

function outgoing(wire: BaseMessage[][], snapshots: Row[] = [], extra: string[] = []): Outgoing {
  const sent = wire.flatMap(messages => serializeMessages(messages));
  const rawParts = wire.flat().map(message => JSON.stringify(message.toDict()));
  return {
    wire: sent,
    attempt: serializeMessages(wire[0] ?? []),
    calls: wire.map(messages => serializeMessages(messages)),
    snapshots,
    texts: [...sent.map(message => message.content), ...rawParts, ...snapshots.map(row => stringify(row)), ...extra],
  };
}

export function stringify(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) => (typeof item === 'bigint' ? item.toString() : item));
}

function assembler(db: WorldDb): ContextAssembler {
  return new ContextAssembler({ getPostgresClient: () => db } as never, { render: async () => '' } as never);
}

export type WriterNode = 'draft' | 'repair' | 'rewrite';

export interface WriterCall {
  node?: WriterNode;
  guidance?: string;
  findings?: string[];
  /** The draft comes back without a title, so the title helper runs on the draft's prose. */
  untitled?: boolean;
  /** The judge's knowledge-compliance issues, turned into the writer's leak lines the way the judge node does. */
  judgeLeaks?: string[];
  plugin?: PluginSpec;
}

/** One writer attempt of chapter `chapter` through the real graph nodes, router and snapshot capture. */
export async function writerCall(spec: WorldSpec, chapter: number, call: WriterCall = {}): Promise<Outgoing & { pack: Row }> {
  const tables = worldTables(spec);
  const db = worldDb(tables);
  const { router, wire } = capturingRouter();
  const snapshots = snapshotStore();
  const policy = policyOf(call.plugin);
  if (call.untitled) {
    const structured = router.structured.bind(router);
    router.structured = async (prompt, input, ctx, project, callPolicy) => {
      const result = await structured(prompt, input, ctx, project, callPolicy);
      return (prompt.key === 'generation' ? { ...(result as object), title: '' } : result) as never;
    };
  }
  const nodes = createChapterGenerationNodes({
    db: db as never,
    contextAssembler: assembler(db),
    modelRouter: router,
    telemetry: {} as never,
    toolRegistry: {} as never,
    indexingService: {} as never,
    pluginPolicy: { scoped: async () => ({ for: () => policy, forPack: () => policy }) } as never,
    writerSnapshots: snapshots.service,
  });
  const locked = (await loadWriterDisclosurePolicy(db as never, PROJECT_ID, chapter)).lockedFacts;
  const knowledge = mergeKnowledgeCompliance(call.judgeLeaks ? { compliant: false, issues: call.judgeLeaks } : undefined, [], [...locked]);
  const state = {
    projectId: String(PROJECT_ID),
    chapter,
    runId: 'run-1',
    attempt: 0,
    guidance: call.guidance ?? '',
    findings: [...(call.findings ?? []).map(text => ({ severity: 'soft', text })), ...knowledge.findings],
    knowledgeWriterFindings: knowledge.writerFindings,
    prose: 'The tide came in.',
    title: 'Low Water',
  };
  const { contextPackId, contentMode } = await nodes.assembleContext(state as never);
  const run = { ...state, contextPackId, contentMode };
  if (call.node === 'repair') await nodes.repairPatch(run as never);
  else if (call.node === 'rewrite') await nodes.repairRewrite(run as never);
  else await nodes.draftChapter(run as never);
  await settle();
  const pack = (tables.get('contextPacks') ?? []).at(-1) ?? {};
  return { ...outgoing(wire, snapshots.rows, [String(pack['rendered'] ?? '')]), pack };
}

/** An unrestricted fill of chapter `chapter` through the real generation service and router. */
export async function fillCall(spec: WorldSpec, chapter: number, call: { guidance: string; plugin?: PluginSpec }): Promise<Outgoing> {
  const reads = worldDb(worldTables(spec));
  const fake = fakeGenerationDb({ draftReads: [], draftWriteResult: [draftRow({ projectId: PROJECT_ID, chapter })] });
  const { router, wire } = capturingRouter();
  const policy = policyOf(call.plugin);
  const service = makeGenerationService(
    { ...fake.db, query: reads.query },
    { modelRouter: router, contextAssembler: assembler(reads), pluginPolicy: { resolve: async () => policy } },
  );
  await service.generateUnrestricted(PROJECT_ID, chapter, { guidance: call.guidance });
  return outgoing(wire);
}

/** An author-requested revision of chapter `chapter` through the real generation service, router and snapshot capture. */
export async function reviseCall(spec: WorldSpec, chapter: number, call: { note: string; plugin?: PluginSpec }): Promise<Outgoing> {
  const tables = worldTables(spec);
  const reads = worldDb(tables);
  const fake = fakeGenerationDb({
    draftReads: [draftRow({ projectId: PROJECT_ID, chapter, body: 'The tide came in.' })],
    draftWriteResult: [draftRow({ projectId: PROJECT_ID, chapter })],
  });
  const { router, wire } = capturingRouter();
  const snapshots = snapshotStore();
  const policy = policyOf(call.plugin);
  const service = makeGenerationService(
    { ...fake.db, query: reads.query },
    { modelRouter: router, contextAssembler: assembler(reads), pluginPolicy: { resolve: async () => policy }, writerSnapshots: snapshots.service },
  );
  await service.reviseDraft(PROJECT_ID, chapter, { note: call.note });
  await settle();
  return outgoing(wire, snapshots.rows);
}

const REFUSED_AFTER_THE_CALL = 'outgoing: the suggestion write is not under test';

/** An Ask-for-changes passage rewrite on chapter `chapter` through the real service, router and snapshot capture; the suggestion write that follows is refused. */
export async function passageCall(spec: WorldSpec, chapter: number, call: { passage: string; request: string; plugin?: PluginSpec }): Promise<Outgoing> {
  const reads = worldDb(worldTables(spec));
  const db = { ...reads, transaction: async () => Promise.reject(new Error(REFUSED_AFTER_THE_CALL)) };
  const { router, wire } = capturingRouter();
  const snapshots = snapshotStore();
  const policy = policyOf(call.plugin);
  const service = new PassageRewriteService({ getPostgresClient: () => db } as never, router, assembler(reads), { resolve: async () => policy } as never, snapshots.service);
  const draft = (await reads.query['drafts']?.findFirst({ where: and(eq(schema.drafts.projectId, PROJECT_ID), eq(schema.drafts.chapter, chapter)) })) as Row;
  const body = String(draft['body']);
  const start = body.indexOf(call.passage);
  const request = {
    base: { draftId: draft['id'] as bigint, revision: draft['revision'] as number, saveSeq: 0 },
    start,
    end: start + call.passage.length,
    passageHash: passageHash(call.passage),
    request: call.request,
  };
  await service.request(PROJECT_ID, chapter, request).catch((err: unknown) => {
    if (!(err instanceof Error) || err.message !== REFUSED_AFTER_THE_CALL) throw err;
  });
  await settle();
  return outgoing(wire, snapshots.rows);
}

export interface ChatCall {
  message?: string;
  /** Lookups the first round asks for; their results ride the second round's history. */
  lookups?: { tool: string; args: Record<string, unknown> }[];
}

const registry = new ToolRegistryService();

/** One hub chat turn: the real pack, playbook with its lookup tools, prompt and router; lookups run through the registry's own handlers. */
export async function chatCall(spec: WorldSpec, call: ChatCall = {}): Promise<Outgoing> {
  const db = worldDb(worldTables(spec));
  const { router, wire } = capturingRouter();
  const tools = registry.getRaw('chat-hub');
  const scopeInstructions = chatScopeInstructions(tools);
  const pack = await assembler(db).forNovelChat(PROJECT_ID, new Date(0), { promptTokens: 4_000, requestTokens: 0 });
  const prompt = buildChatRefinePrompt('project', { proseEdits: false });
  const turnRules = renderTurnRules({ proseEdits: false, justDiscussing: false });
  const userMessage = call.message ?? 'Where does the story stand?';
  const history: BaseMessage[] = [];
  const captured: BaseMessage[][] = [];
  const ctx = { projectId: PROJECT_ID, runId: 'run-1', node: 'chat-turn', promptKey: prompt.key, promptVersion: prompt.version, role: 'chat' };
  const invoke = () =>
    router.structured(
      prompt,
      { scopeInstructions, stableContext: pack.renderedStable, history: [...history], volatileContext: pack.renderedVolatile || 'nothing', turnRules, userMessage },
      { ...ctx, onMessages: messages => void captured.push(messages) },
    );
  await invoke();
  if (call.lookups?.length) {
    const toolCtx = { chapter: null, db, node: 'chat-hub', projectId: PROJECT_ID, retrieval: {} as never, runId: 'run-1' };
    const results = await Promise.all(
      call.lookups.map(async lookup => `${lookup.tool}: ${String(await tools.find(tool => tool.name === lookup.tool)?.handler(lookup.args, toolCtx as never))}`),
    );
    history.push(new AIMessage(JSON.stringify({ reply: 'Checking.', lookups: call.lookups })), new HumanMessage(`Lookup results:\n${results.join('\n\n')}`));
    await invoke();
  }
  const sent = outgoing(wire);
  const snapshotted = captured.flatMap(messages => serializeMessages(messages));
  return { ...sent, snapshots: snapshotted as unknown as Row[] };
}

export type ArtSubject = { entity: string; asOf: number } | { chapter: number } | { cover: true };

export interface ArtCall {
  /** One author-attached reference whose note is this. */
  referenceNote?: string;
  /** The portrait name that reference carries. */
  referenceName?: string;
  /** The vision model's description of that reference, used when the subject has no appearance of its own. */
  described?: string;
  plugin?: PluginSpec;
  /** Refine the stored image instead of starting one, so the stored row decides the policy. */
  refine?: boolean;
}

/**
 * One illustration round through the real service: its disclosure choice, the real pack, the compose call through the router and the image
 * request, whose prompt is captured. The resolver hands back at most one reference and the image model draws nothing.
 */
export async function artCall(spec: WorldSpec, subject: ArtSubject, call: ArtCall = {}): Promise<Outgoing> {
  const tables = worldTables(spec);
  const reads = worldDb(tables);
  const input =
    'entity' in subject
      ? { subjectType: 'entity' as const, subjectKey: subject.entity, depictsChapter: subject.asOf }
      : 'chapter' in subject
        ? { subjectType: 'chapter' as const, subjectKey: String(subject.chapter) }
        : { subjectType: 'cover' as const, subjectKey: null };
  const stored = {
    id: 9n,
    projectId: PROJECT_ID,
    subjectType: input.subjectType,
    subjectKey: input.subjectKey,
    depictsChapter: 'depictsChapter' in input ? input.depictsChapter : null,
    status: 'active',
    revision: 1,
    selectedRef: null,
    candidates: [{ ref: 'candidates/one.png', createdAt: '', instructionsHash: '', referenceRefs: [], references: [] }],
    references: [],
    promptSpec: {
      basePrompt: 'A lamp keeper on a wet pier at dusk.',
      subjectFraming: 'a bust portrait crop',
      styleNotes: 'ink wash',
      instructions: [],
      promptKey: 'illustration-compose',
      promptVersion: '1',
    },
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  tables.set('illustrations', [stored]);
  const returning = async (values: Row) => [{ ...stored, ...values }];
  const db = {
    ...reads,
    insert: () => ({ values: (values: Row) => ({ returning: () => returning(values) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [stored] }) }) }),
  };
  const { router, wire } = capturingRouter();
  const imagePrompts: string[] = [];
  (router as unknown as Record<string, unknown>)['images'] = async (request: { prompt: string }) => {
    imagePrompts.push(request.prompt);
    return [];
  };
  const reference = { source: call.referenceName ? 'portrait' : 'cover', ref: 'refs/one.png', role: call.described ? 'likeness' : 'style', origin: 'attached', reason: 'attached' };
  const references = call.referenceNote || call.described ? [{ ...reference, note: call.referenceNote, name: call.referenceName }] : [];
  const resolved = { references, dataUrls: call.described ? ['data:image/png;base64,QUJD'] : [], warnings: [], capacity: 4, totalBytes: 0 };
  const policy = policyOf(call.plugin);
  const service = new IllustrationService(
    { getPostgresClient: () => db } as never,
    { getPublicUrl: () => undefined } as never,
    router,
    assembler(reads),
    {
      runChain: async (_projectId: bigint, _graph: string, _target: string, _input: unknown, run: (runId: string) => Promise<unknown>) => ({ result: await run('run-1') }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    { resolve: async () => policy } as never,
    { resolve: async () => structuredClone(resolved), view: (item: unknown) => item } as never,
    { describe: async () => ({ appearance: call.described, confidence: 'high' }) } as never,
  );
  if (call.refine) await service.refine(PROJECT_ID, 9n, { add: 'Warmer light.' });
  else await service.start(PROJECT_ID, input);
  return { ...outgoing(wire, [], imagePrompts), imagePrompts };
}

/** The outline pack for `chapter`, with the real catalog, as the planner receives it. */
export async function outlinePack(spec: WorldSpec, chapter: number): Promise<Outgoing> {
  const db = worldDb(worldTables(spec));
  const catalog = new CatalogService({ getPostgresClient: () => db } as never);
  const pack = await new ContextAssembler({ getPostgresClient: () => db } as never, catalog).forOutline(PROJECT_ID, chapter, { dryRun: true } as never);
  return outgoing([], [], [pack.rendered]);
}

export async function validationPack(spec: WorldSpec, from: number, to: number): Promise<Outgoing> {
  const pack = await assembler(worldDb(worldTables(spec))).forValidationWindow(PROJECT_ID, from, to);
  return outgoing([], [], [pack.rendered]);
}

export interface PreviewParity {
  preview: Awaited<ReturnType<WriterPreviewService['preview']>>;
  pack: Awaited<ReturnType<ContextAssembler['forChapter']>>;
  previewText: string;
}

/**
 * The writer preview of a pending plan card for `chapter`, and the pack the writer would receive once that card is the stored plan: the
 * card's fields are written over the stored brief in a second world, so the two are judged from the same plan.
 */
export async function previewParity(spec: WorldSpec, chapter: number, card: Row): Promise<PreviewParity> {
  const staged = worldTables(spec);
  staged.set('refinementProposals', [{ id: 50n, projectId: PROJECT_ID, kind: 'chapter_plan', status: 'pending', changeSet: [{ op: 'brief.update', chapter, ...card }] }]);
  const stagedDb = worldDb(staged);
  const preview = await new WriterPreviewService({ getPostgresClient: () => stagedDb } as never, assembler(stagedDb)).preview(PROJECT_ID, 50n);

  const applied = worldTables(spec);
  const brief = applied.get('briefs')?.find(row => row['chapter'] === chapter);
  if (brief) Object.assign(brief, card);
  const appliedDb = worldDb(applied);
  const disclosure = await loadWriterDisclosurePolicy(appliedDb as never, PROJECT_ID, chapter);
  const pack = await assembler(appliedDb).forChapter(PROJECT_ID, chapter, { dryRun: true, disclosure, budgetTokens: 200_000 });
  return { preview, pack, previewText: stringify(preview) };
}
