/**
 * Importing npm packages
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { type APIRequestContext, type APIResponse, expect } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { apiContext, AUTH_DIR, csrfHeaders, type LoginPersona, mutate, novelForgeDb, pollUntil } from '../../lib';

/**
 * Defining types
 */

export interface ModelRef {
  readonly provider: string;
  readonly model: string;
}

export type EntityType = 'character' | 'faction' | 'location' | 'power_rule' | 'item' | 'concept';

export interface EntitySeed {
  entityKey: string;
  name: string;
  type?: EntityType;
  significance?: 'major' | 'minor' | null;
  body?: string | null;
}

export type ContentMode = 'standard' | 'unrestricted';

/** What an API answer and a page's network answer share, so either can be judged by the same helpers. */
export type HttpAnswer = Pick<APIResponse, 'status' | 'text'>;

export type CostTier = 'economy' | 'balanced' | 'performant';

export interface CreatedNovel {
  projectId: string;
  sessionId: string;
}

export interface Draft {
  id: string;
  chapter: number;
  title?: string | null;
  body?: string | null;
  summary?: string | null;
  status: 'draft' | 'final';
  reviewStatus: 'generating' | 'needs_review' | 'contradiction' | 'approved' | 'final';
  revision: number;
  saveSeq: number;
  approvedRevision: number | null;
  isolated: boolean;
  generator: string;
}

export interface ChapterText {
  title?: string;
  body: string;
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  costTier?: CostTier | null;
  contentMode?: ContentMode | null;
}

export interface ChatTranscript {
  messages: ChatMessage[];
  pendingTurn?: { runId: string } | null;
  failedTurn?: { status: string; code?: string | null; message?: string | null } | null;
}

export interface ChatJob {
  id: string;
  kind: string;
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled';
  lastError?: string | null;
  progress?: { proposalId?: string; appliedProposalId?: string } | null;
}

export interface FinalizeReviewItem {
  id: string;
  category: string;
  claim: string;
  decision?: 'kept' | 'edited' | 'skipped' | null;
}

export interface ReconcileResult {
  novel: string;
  pushed: number[];
  deleted?: number[];
  skipped: number[];
  failed: { ordinal: number; error: string }[];
  unknownOrdinals?: number[];
  wiki: { pushed: string[]; deleted?: string[]; skipped: string[]; failed: { entryKey: string; error: string }[] };
}

export interface ForgeJob {
  status: 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled';
  lastError: string | null;
}

export interface FinalizeReview {
  status: 'preparing' | 'ready' | 'failed' | 'applied' | 'reverted';
  current: boolean;
  isolated: boolean;
  error?: string | null;
  open: { consequential: number; routine: number };
  consequential: FinalizeReviewItem[];
  routine: FinalizeReviewItem[];
}

/**
 * Declaring the constants
 *
 * Shared building blocks for the Novel Forge specs. The suite splits in two:
 *   - deterministic specs, which drive the product through hand-written chapters, imports and settings and never wait on a model;
 *   - model-backed specs, tagged `MODEL_TAG` and gated by `aiAvailable()`, which spend real calls on a Haiku-pinned project.
 * `bun run test:deterministic` skips the tag; `bun run test:model` runs only it. Model-backed assertions check structure (a job
 * finished, a draft has prose, a review settled), never wording.
 */

export const MODEL_TAG = '@model';

const JOB_SETTLE_TIMEOUT_MS = 30_000;

export class ForgeJobTimeoutError extends Error {
  override readonly name = 'ForgeJobTimeoutError';
}

/** A whole model-backed flow: the dev gateway serialises AI work at concurrency 1 with a 5-minute ceiling per call. */
export const MODEL_FLOW_TIMEOUT_MS = 30 * 60_000;

const MODEL_CALL_TIMEOUT_MS = 10 * 60_000;

/**
 * Every text role a project's `config.models` accepts an override for (`ProjectModelOverrides`). A role left on its tier default routes
 * that stage to a larger model and defeats the pin; `image` and `embedding` are not text roles and stay untouched.
 */
export const HAIKU_TEXT_ROLES = [
  'generation',
  'revision',
  'fix',
  'premise',
  'plan',
  'outline',
  'bible',
  'extraction',
  'judge',
  'validation',
  'continuity',
  'review',
  'audit',
  'chat',
  'title',
  'compact',
] as const;

/** Every LLM goes through OpenRouter, so a model is its OpenRouter `vendor/model` slug; anything off `MODEL_REGISTRY` is refused with AI_002. */
export const HAIKU_MODEL: ModelRef = { provider: 'openrouter', model: 'anthropic/claude-haiku-4.5' };

export const NOVEL_NOTES = [
  'Working idea: a cartographer in a river city is hired to map a district that is not on any chart.',
  'The protagonist is Tamsin Vale, a careful surveyor who distrusts anything she cannot measure.',
  'Her rival is Odo Kessling, a guild assessor who wants the district sealed before it is mapped.',
  'The district moves one street east every night, and only people who have never lied can find it.',
  'Tone: quiet mystery with warmth. The ending is a choice between publishing the map and burning it.',
].join('\n\n');

export const CHAPTER_ONE: ChapterText = {
  title: 'The Street That Moved',
  body: [
    'Tamsin Vale set her chain across the cobbles at dawn and counted the links twice, because the numbers had been wrong the night before.',
    'The lamplighter watched her from the corner. "It was here yesterday," he said, and pointed at a wall that had not been there at all.',
    'She wrote the measurement in her ledger, underlined it, and did not believe it. By the time the bells rang noon the wall had moved a pace to the east.',
  ].join('\n\n'),
  summary: 'Tamsin measures a street at dawn and finds that a wall has shifted overnight; by noon it moves again while she watches.',
};

export const CHAPTER_TWO: ChapterText = {
  title: 'The Assessor Calls',
  body: [
    'Odo Kessling arrived with a stamped writ and a smile that did not reach his eyes. "The guild would prefer the district stayed unmapped," he said.',
    'Tamsin folded the writ into her ledger without reading it. "The guild hired me," she said. "The guild can read the map when it is finished."',
  ].join('\n\n'),
  summary: 'Odo Kessling brings a guild writ to stop the survey; Tamsin refuses and keeps working.',
};

export function haikuModelConfig(): { models: Record<string, ModelRef> } {
  return { models: Object.fromEntries(HAIKU_TEXT_ROLES.map(role => [role, HAIKU_MODEL])) };
}

/** A collision-proof suffix for project names and slugs — the seed wipes e2e-owned projects each run, but a run may create several. */
export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Parses a response body as JSON, tolerating an empty body (204) by returning `undefined`. */
export async function jsonOrUndefined<T = Record<string, unknown>>(response: HttpAnswer): Promise<T | undefined> {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : undefined;
}

export async function errorCode(response: HttpAnswer): Promise<string | undefined> {
  return (await jsonOrUndefined<{ code?: string }>(response))?.code;
}

export async function expectStatus(response: HttpAnswer, status: number, what: string): Promise<void> {
  expect(response.status(), `${what} — body ${await response.text()}`).toBe(status);
}

export async function createProject(
  ctx: APIRequestContext,
  body: { name: string; kind: 'new_novel'; title?: string; instructions?: string; contentMode?: ContentMode },
): Promise<{ id: string; response: APIResponse }> {
  const response = await mutate(ctx, 'post', '/api/v1/projects', { data: body });
  const parsed = (await jsonOrUndefined<{ id: string }>(response)) ?? { id: '' };
  return { id: parsed.id, response };
}

/** Starts a novel the way the Start screen does: a `new_novel` project, the author's notes kept verbatim, and an auto-mode chat. */
export async function createNovel(ctx: APIRequestContext, body: { title: string; notes?: string; contentMode?: ContentMode }): Promise<CreatedNovel> {
  const response = await mutate(ctx, 'post', '/api/v1/projects/new-novel', { data: body });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as CreatedNovel;
}

/** Pins every text role of `projectId` to Haiku. Run it before anything that can reach a model, including an approval. */
export async function pinHaiku(ctx: APIRequestContext, projectId: string): Promise<APIResponse> {
  return mutate(ctx, 'patch', `/api/v1/projects/${projectId}`, { data: { config: haikuModelConfig() } });
}

/** Best-effort project delete — cleanup must never mask the assertion that failed. */
export async function deleteProjectQuietly(ctx: APIRequestContext, projectId: string): Promise<void> {
  await mutate(ctx, 'delete', `/api/v1/projects/${projectId}`).catch(() => undefined);
}

export async function readDraft(ctx: APIRequestContext, projectId: string, chapter: number): Promise<Draft> {
  const response = await ctx.get(`/api/v1/projects/${projectId}/drafts/${chapter}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Draft;
}

/** Opens the one chapter the server allows next, as "Write it myself" does; the server picks the number. */
export async function startNextChapter(ctx: APIRequestContext, projectId: string): Promise<Draft> {
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/drafts/next`, { data: {} });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as Draft;
}

/** A hand save against the draft the author read, as the workspace's autosave sends it. */
export async function saveChapter(ctx: APIRequestContext, projectId: string, draft: Draft, text: ChapterText): Promise<Draft> {
  const response = await mutate(ctx, 'put', `/api/v1/projects/${projectId}/drafts/${draft.chapter}`, {
    data: { baseDraftId: draft.id, baseRevision: draft.revision, baseSaveSeq: draft.saveSeq, ...text },
  });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Draft;
}

export async function writeChapterByHand(ctx: APIRequestContext, projectId: string, text: ChapterText): Promise<Draft> {
  return saveChapter(ctx, projectId, await startNextChapter(ctx, projectId), text);
}

/** Imports prose onto `base`, as "Import chapters" does; `isolated` firewalls it as an unrestricted chapter and is left to the server when omitted. */
export async function importDraft(ctx: APIRequestContext, projectId: string, base: Draft, text: ChapterText, options: { isolated?: boolean } = {}): Promise<Draft> {
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/drafts/${base.chapter}/import`, {
    data: {
      baseDraftId: base.id,
      baseRevision: base.revision,
      baseSaveSeq: base.saveSeq,
      prose: text.body,
      title: text.title,
      summary: text.summary,
      ...(options.isolated === undefined ? {} : { isolated: options.isolated }),
    },
  });
  await expectStatus(response, 200, `importing chapter ${base.chapter}`);
  return readDraft(ctx, projectId, base.chapter);
}

/** Pastes prose into the next chapter the server allows. */
export async function pasteChapter(ctx: APIRequestContext, projectId: string, text: ChapterText, options: { isolated?: boolean } = {}): Promise<Draft> {
  return importDraft(ctx, projectId, await startNextChapter(ctx, projectId), text, { isolated: options.isolated ?? false });
}

export async function approveChapter(ctx: APIRequestContext, projectId: string, draft: Draft): Promise<APIResponse> {
  return mutate(ctx, 'post', `/api/v1/projects/${projectId}/drafts/${draft.chapter}/approve`, {
    data: { revision: draft.revision, saveSeq: draft.saveSeq, draftId: draft.id },
  });
}

/**
 * Waits for a job to settle, read from the forge's own table: `GET /api/v1/jobs/:id` and the project job list answer 500 for any job, because
 * `usageForJobs` joins uuid `workflow_runs.id` to varchar `model_calls.run_id` (`job.service.ts:410`), which Postgres refuses at plan time.
 */
export async function pollJobStatus(jobId: string, timeoutMs = JOB_SETTLE_TIMEOUT_MS): Promise<ForgeJob> {
  const job = await pollUntil(
    async () => (await novelForgeDb()<ForgeJob[]>`SELECT status, last_error AS "lastError" FROM jobs WHERE id = ${jobId}`)[0],
    current => current !== undefined && current.status !== 'pending' && current.status !== 'in_progress',
    { timeoutMs, intervalMs: 500 },
  );
  if (!job || job.status === 'pending' || job.status === 'in_progress') throw new ForgeJobTimeoutError(`job ${jobId} still ${job?.status ?? 'missing'} after ${timeoutMs}ms`);
  return job;
}

/** Adds a Story Bible entity; one with a `body` projects a reader wiki entry visible before the first chapter. */
export async function createEntity(ctx: APIRequestContext, projectId: string, seed: EntitySeed): Promise<void> {
  const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/entities`, {
    data: { entityKey: seed.entityKey, name: seed.name, type: seed.type ?? 'character', body: seed.body ?? undefined, significance: seed.significance ?? undefined },
  });
  expect(response.status(), `creating entity ${seed.entityKey} — body ${await response.text()}`).toBe(201);
}

/** Polls a web-novel GET until it returns `wantStatus`, so an in-flight reader push has time to arrive. */
export async function pollWebNovel(ctx: APIRequestContext, path: string, wantStatus: number, timeoutMs = 45_000): Promise<APIResponse> {
  return pollUntil(
    () => ctx.get(path),
    response => response.status() === wantStatus,
    { timeoutMs, intervalMs: 2_000 },
  );
}

/**
 * Calls the synchronous `reconcile` until every wanted chapter and wiki entry has settled (pushed, or skipped as already in sync) with no
 * failures. Reconcile is the deterministic converge trigger: the auto-push job dedups concurrent enqueues, so a chapter published during
 * an in-flight converge never gets its own push. One pass pushes the due chapters and then recomputes the wiki off those ordinals.
 */
export async function reconcileUntilConverged(ctx: APIRequestContext, projectId: string, wantChapters: number[], wantWiki: string[], timeoutMs = 90_000): Promise<ReconcileResult> {
  const empty: ReconcileResult = { novel: '', pushed: [], skipped: [], failed: [], wiki: { pushed: [], skipped: [], failed: [] } };
  const converged = (result: ReconcileResult): boolean => {
    const chapters = new Set([...result.pushed, ...result.skipped]);
    const wiki = new Set([...result.wiki.pushed, ...result.wiki.skipped]);
    return result.failed.length === 0 && result.wiki.failed.length === 0 && wantChapters.every(o => chapters.has(o)) && wantWiki.every(k => wiki.has(k));
  };
  return pollUntil(
    async () => {
      const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/publications/reconcile`);
      return response.status() === 200 ? ((await response.json()) as ReconcileResult) : empty;
    },
    converged,
    { timeoutMs, intervalMs: 3_000 },
  );
}

/** A CSRF-authenticated POST that waits as long as a synchronous model call can take. */
export async function slowPost(ctx: APIRequestContext, url: string, data?: unknown): Promise<APIResponse> {
  const headers = await csrfHeaders(ctx);
  return ctx.post(url, { headers, timeout: MODEL_CALL_TIMEOUT_MS, ...(data === undefined ? {} : { data }) });
}

/** Starts a chat turn the way the composer does and waits for its reply to land; a failed or cancelled turn fails the test. */
export async function chatTurn(
  ctx: APIRequestContext,
  novel: CreatedNovel,
  content: string,
  options: { costTier?: CostTier; contentMode?: ContentMode } = {},
): Promise<ChatTranscript> {
  const start = await mutate(ctx, 'post', `/api/v1/projects/${novel.projectId}/chats/${novel.sessionId}/turn/stream`, { data: { content, ...options } });
  expect(start.status(), await start.text()).toBe(202);

  const transcript = await pollUntil(
    async () => (await (await ctx.get(`/api/v1/projects/${novel.projectId}/chat/sessions/${novel.sessionId}/messages`)).json()) as ChatTranscript,
    list => !list.pendingTurn && list.messages.some(message => message.role === 'assistant'),
    { timeoutMs: MODEL_CALL_TIMEOUT_MS, intervalMs: 3_000 },
  );
  expect(transcript.pendingTurn ?? null, 'the chat turn is still running').toBeNull();
  expect(transcript.failedTurn ?? null, `the chat turn failed: ${JSON.stringify(transcript.failedTurn)}`).toBeNull();
  return transcript;
}

/** Waits for a job of `kind` that this chat started to settle, and returns it; the caller asserts on its status. */
export async function settledChatJob(ctx: APIRequestContext, novel: CreatedNovel, kind: string): Promise<ChatJob | undefined> {
  const settled = (items: ChatJob[]): ChatJob | undefined => items.find(job => job.kind === kind && !['pending', 'in_progress'].includes(job.status));
  const items = await pollUntil(
    async () => ((await (await ctx.get(`/api/v1/projects/${novel.projectId}/chat/sessions/${novel.sessionId}/jobs`)).json()) as { items: ChatJob[] }).items,
    listed => settled(listed) !== undefined,
    { timeoutMs: MODEL_CALL_TIMEOUT_MS, intervalMs: 3_000 },
  );
  return settled(items);
}

export async function readFinalizeReview(ctx: APIRequestContext, projectId: string, chapter: number): Promise<APIResponse> {
  return ctx.get(`/api/v1/projects/${projectId}/drafts/${chapter}/finalize-review`);
}

/** Waits out the finalize-review read an approval starts, then answers every item by keeping it and finalizes through the review. */
export async function finalizeThroughReview(ctx: APIRequestContext, projectId: string, chapter: number): Promise<FinalizeReview> {
  const review = await pollUntil(
    async () => (await (await readFinalizeReview(ctx, projectId, chapter)).json()) as FinalizeReview,
    current => current.status !== 'preparing',
    { timeoutMs: MODEL_CALL_TIMEOUT_MS, intervalMs: 3_000 },
  );
  expect(review.status, `the finalize review did not become ready: ${review.error ?? ''}`).toBe('ready');

  const base = `/api/v1/projects/${projectId}/drafts/${chapter}/finalize-review`;
  if (review.open.routine > 0) expect((await mutate(ctx, 'post', `${base}/keep-routine`)).status()).toBe(200);
  for (const item of review.consequential.filter(candidate => !candidate.decision)) {
    const kept = await mutate(ctx, 'post', `${base}/items/${item.id}/decision`, { data: { decision: 'kept' } });
    if (kept.status() === 200) continue;
    const skipped = await mutate(ctx, 'post', `${base}/items/${item.id}/decision`, { data: { decision: 'skipped', reason: 'Not recorded by the e2e run' } });
    expect(skipped.status(), await skipped.text()).toBe(200);
  }

  const finalize = await slowPost(ctx, `${base}/finalize`);
  expect(finalize.status(), await finalize.text()).toBe(200);
  return (await (await readFinalizeReview(ctx, projectId, chapter)).json()) as FinalizeReview;
}

/**
 * Whether model-backed specs may run. Live calls are metered, so they are opt-in: without `E2E_LIVE_AI=1` this answers false without
 * touching the gateway. With it, a throwaway Haiku-pinned project fires the cheapest AI endpoint (`POST /premise/enhance`) and the
 * verdict is cached to `.auth/ai-probe.json` so every worker and spec in a run reuses one probe. Any non-2xx caches a negative result —
 * model specs then `test.skip` rather than fail.
 */
const AI_PROBE_CACHE = path.join(AUTH_DIR, 'ai-probe.json');
const AI_PROBE_TTL_MS = 20 * 60 * 1000;

export function liveAiEnabled(): boolean {
  return process.env.E2E_LIVE_AI?.trim() === '1';
}

export async function aiAvailable(persona: LoginPersona = 'user1'): Promise<boolean> {
  if (!liveAiEnabled()) return false;
  const cached = readProbeCache();
  if (cached !== undefined) return cached;

  const ctx = await apiContext('novelForge', persona);
  try {
    return writeProbeCache(await probeGateway(ctx));
  } finally {
    await ctx.dispose();
  }
}

async function probeGateway(ctx: APIRequestContext): Promise<boolean> {
  let projectId = '';
  try {
    const created = await createProject(ctx, { name: `e2e-forge-aiprobe-${uniqueSuffix()}`, kind: 'new_novel', contentMode: 'standard' });
    projectId = created.id;
    if (!projectId) return false;
    const pin = await pinHaiku(ctx, projectId);
    if (!pin.ok()) return false;
    const response = await mutate(ctx, 'post', `/api/v1/projects/${projectId}/premise/enhance`, {
      data: { overview: 'A lighthouse keeper discovers the light summons sea spirits.' },
    }).catch(() => undefined);
    return !!response && response.ok();
  } catch {
    return false;
  } finally {
    if (projectId) await deleteProjectQuietly(ctx, projectId);
  }
}

function readProbeCache(): boolean | undefined {
  if (!existsSync(AI_PROBE_CACHE)) return undefined;
  try {
    const { available, ts } = JSON.parse(readFileSync(AI_PROBE_CACHE, 'utf8')) as { available: boolean; ts: number };
    return Date.now() - ts < AI_PROBE_TTL_MS ? available : undefined;
  } catch {
    return undefined;
  }
}

function writeProbeCache(available: boolean): boolean {
  if (!existsSync(AUTH_DIR)) mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(AI_PROBE_CACHE, JSON.stringify({ available, ts: Date.now() }), 'utf8');
  return available;
}

export function aiSkipReason(): string {
  return liveAiEnabled()
    ? 'AI gateway probe failed (premise/enhance on a Haiku-pinned project did not return 2xx)'
    : 'live AI calls are opt-in and metered: set E2E_LIVE_AI=1 to run them';
}
