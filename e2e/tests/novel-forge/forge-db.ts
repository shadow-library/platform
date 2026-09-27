/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';
import { type Sql, type TransactionSql } from 'postgres';

/**
 * Importing user defined packages
 */
import { novelForgeDb } from '../../lib';

/**
 * Defining types
 */

export type ForgeOwnerKind = 'user' | 'bot';

/** The `(owner_kind, owner_id)` pair every ownership check compares; a bot and a user routinely share a numeric id. */
export interface ForgeOwner {
  readonly kind: ForgeOwnerKind;
  readonly id: string;
}

export type ForgeContentMode = 'standard' | 'unrestricted';

export type ForgeCostTier = 'economy' | 'balanced' | 'performant';

export type ModelCallStatus = 'ok' | 'parse_error' | 'repaired' | 'refused' | 'transport_error' | 'timeout';

export type CostSource = 'provider' | 'gateway' | 'estimate';

export type WorkflowRunStatus = 'running' | 'completed' | 'awaiting_review' | 'failed' | 'cancelled';

export type JobKind = 'generate' | 'finalize' | 'backfill' | 'publish' | 'import' | 'organise' | 'plan' | 'review' | 'audit' | 'finalize_review';

export type JobStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'cancelled';

export type ToolCallStatus = 'ok' | 'invalid_args' | 'handler_error' | 'budget_exceeded';

/** Every role the router resolves a model for (`AiRole` in the server's `ai/defaults.ts`). */
export const AI_ROLES = [
  'extraction',
  'generation',
  'judge',
  'fix',
  'outline',
  'revision',
  'title',
  'continuity',
  'validation',
  'review',
  'premise',
  'plan',
  'bible',
  'audit',
  'chat',
  'compact',
  'illustration',
  'image',
  'vision',
  'embedding',
] as const;

export type AiRole = (typeof AI_ROLES)[number];

export interface ModelRef {
  readonly provider: string;
  readonly model: string;
}

export interface ForgeProjectSeed {
  owner: ForgeOwner;
  /** Required by a check constraint for a bot owner. */
  organisationId?: string | null;
  /** Default: true for a bot owner, false for a user, as the server stamps them. */
  sharedWithOrg?: boolean;
  name?: string;
  contentMode?: ForgeContentMode;
  costTier?: ForgeCostTier;
}

export interface ForgeProjectRow {
  readonly id: string;
  readonly ownerKind: ForgeOwnerKind;
  readonly ownerId: string | null;
  readonly organisationId: string | null;
  readonly sharedWithOrg: boolean;
  readonly contentMode: ForgeContentMode;
  readonly costTier: ForgeCostTier;
  readonly config: { models?: Record<string, ModelRef> } | null;
}

export interface ProjectOwnershipPatch {
  owner?: ForgeOwner;
  organisationId?: string | null;
  sharedWithOrg?: boolean;
}

export interface ModelCallSeed {
  projectId: string;
  runId?: string | null;
  role?: string;
  provider?: string;
  model?: string;
  status?: ModelCallStatus;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  /** `null` records no cost, which leaves the list-price estimate to cover the row's tokens. */
  costUsd?: number | null;
  costSource?: CostSource | null;
  tier?: ForgeCostTier | null;
  contentMode?: ForgeContentMode | null;
  chapter?: number | null;
  rawOutput?: string | null;
  /** How long ago the call was made; default now. */
  ageMs?: number;
}

export interface WorkflowRunSeed {
  projectId: string;
  graph: string;
  target?: string;
  status?: WorkflowRunStatus;
  outcome?: string | null;
  jobId?: string | null;
  contextPackId?: string | null;
  parentRunId?: string | null;
  /** How long ago the run started; default now. */
  startedAgoMs?: number;
  /** How long ago the run ended; omitted leaves a `running` run open and closes any other run when it started. */
  endedAgoMs?: number;
}

export interface WorkflowRunRow {
  readonly id: string;
  readonly status: WorkflowRunStatus;
  readonly outcome: string | null;
  readonly endedAt: Date | null;
}

export interface ToolCallSeed {
  runId: string;
  modelCallId?: string | null;
  node?: string;
  tool?: string;
  status?: ToolCallStatus;
  latencyMs?: number | null;
}

export interface ContextPackSection {
  key: string;
  tier: string;
  segment?: string;
  tokens: number;
  truncated: boolean;
  text?: string;
}

export interface ContextPackSeed {
  projectId: string;
  purpose: string;
  chapter?: number | null;
  sections: ContextPackSection[];
  rendered: string;
  budgetTokens?: number;
  usedTokens?: number;
}

export interface JobSeed {
  projectId: string;
  kind: JobKind;
  target: string;
  status?: JobStatus;
  payload?: Record<string, unknown> | null;
}

export interface AuthoringClaimOptions {
  /**
   * Reserves the claim for this arranged authoring job the way enqueueing does, with no holder token: the janitor leaves the job alone until
   * the heartbeat goes stale, and cancelling the job releases the reservation. Without it the claim is a job-less holder's, as a synchronous
   * action (finalize, insert) takes it.
   */
  jobId?: string | null;
  kind?: JobKind;
  /** How long ago the holder last heartbeated; past `jobs.authoring-claim.ttl-ms` (120 s by default) the claim may be taken over. */
  heartbeatAgoMs?: number;
}

export interface QuotaPinScope {
  /** Owners the caller created and tears down; the only ones a pin may land on. */
  readonly owners: readonly ForgeOwner[];
  /** Re-reads the server's quota window, uncached, through a signed-in person. */
  readonly reader: () => Promise<APIRequestContext>;
  /** The owner's own Novel Forge context when the owner is a person, for the server's view of the pin. */
  readonly ownerCtx?: (owner: ForgeOwner) => APIRequestContext | undefined;
}

/** The owner's rolling AI window as the server enforces it; read once per worker from `GET /api/v1/ai/quota`. */
export interface QuotaLimits {
  readonly maxCalls: number;
  readonly maxCostUsd: number;
  readonly windowMs: number;
}

/**
 * Declaring the constants
 *
 * Arrange-and-assert access to Novel Forge's database, for the states no model-free API call reaches: rows a model call or a
 * workflow run would have written, projects a bot owns, and the authoring claim a running job holds. Timestamps are written on the
 * database clock (`timestamp without time zone`, UTC), which is the clock every server-side window compares against.
 *
 * Keeping a model-capable request from spending — later batches use both guards, the quota pin as the belt and the fail-pin as braces:
 *  - `quotaPin` stands the project's owner at the AI_008 call ceiling. Every paid dispatch (`chatFor`, `structured` and its streaming and
 *    image-input variants, `images`) runs `AiQuotaService.enforce` before `routeModel` decides standard or unrestricted, so it holds on
 *    both paths. It pins every project of that owner, lasts one window (an hour in dev), and fails open if the server cannot read usage;
 *    that owner's usage and cost figures then include the pin's zero-cost rows (prompt key `e2e-quota-pin`).
 *  - `failPin` refuses a standard route with AI_002. It does nothing on an unrestricted route — `generate-unrestricted`, an isolated
 *    chapter or one whose plan is written unrestricted, a plugin raised to the permissive writer — which dispatches the tier default, and a
 *    later `PATCH /projects/:id` carrying `config` replaces the pins.
 * Call `assertSpendGuarded` right before any model-capable request.
 */

/** Not in the model registry, so a standard route refuses it with `AI_002` before any dispatch. */
export const FAIL_PIN_MODEL: ModelRef = { provider: 'openrouter', model: 'e2e/unregistered' };

/** Prompt key of every row this module seeds; a real dispatch always records a registry prompt key. */
const SEEDED_PROMPT_KEY = 'e2e-seed';

const QUOTA_PIN_PROMPT_KEY = 'e2e-quota-pin';

/** A quota pin must outlive the request it guards by at least this much of its window. */
const QUOTA_PIN_MARGIN_MS = 10 * 60 * 1000;

/** Job kinds whose executors call a model; a pending one is picked up by the janitor (authoring kinds) or by boot recovery. */
const MODEL_CAPABLE_JOB_KINDS: readonly JobKind[] = ['generate', 'finalize', 'import', 'organise', 'plan', 'review', 'audit', 'finalize_review'];

const LIVE_JOB_STATUSES: readonly JobStatus[] = ['pending', 'in_progress'];

export class ForgeDbError extends Error {
  override readonly name = 'ForgeDbError';
}

/** A model-capable arrangement that no spend guard covers — the one failure that would cost money if it were ignored. */
export class SpendGuardError extends Error {
  override readonly name = 'SpendGuardError';
}

interface QuotaPinRecord {
  readonly limits: QuotaLimits;
  readonly reader: () => Promise<APIRequestContext>;
  readonly ownerCtx?: APIRequestContext;
}

const quotaPins = new Map<string, QuotaPinRecord>();

let quotaLimits: Promise<QuotaLimits> | undefined;

function ago(ms: number | undefined): string {
  return `${Math.max(0, Math.round(ms ?? 0))} milliseconds`;
}

/**
 * Pins `roles` of a standard project to `FAIL_PIN_MODEL`, keeping any other override — a database write, since the PATCH route refuses an
 * unregistered id. Every role by default: a stage's routing role is not always its route's name (summarising routes as `continuity`).
 */
export async function failPin(projectId: string, roles: readonly AiRole[] = AI_ROLES): Promise<void> {
  const sql = novelForgeDb();
  const pins = Object.fromEntries(roles.map(role => [role, FAIL_PIN_MODEL]));
  const [row] = await sql<{ contentMode: ForgeContentMode; models: Record<string, ModelRef> | null }[]>`
    UPDATE projects
    SET config = jsonb_set(coalesce(config, '{}'::jsonb), '{models}', coalesce(config->'models', '{}'::jsonb) || ${sql.json(pins as never)}::jsonb)
    WHERE id = ${projectId}
    RETURNING content_mode AS "contentMode", config->'models' AS models
  `;
  if (!row) throw new ForgeDbError(`no project ${projectId} to fail-pin`);
  if (row.contentMode !== 'standard') throw new SpendGuardError(`project ${projectId} is ${row.contentMode}: an unrestricted router ignores a fail-pin and would spend`);
  const unpinned = roles.filter(role => row.models?.[role]?.model !== FAIL_PIN_MODEL.model);
  if (unpinned.length > 0) throw new SpendGuardError(`project ${projectId} did not keep the fail-pin for ${unpinned.join(', ')}`);
}

export async function readProjectRow(projectId: string): Promise<ForgeProjectRow | undefined> {
  const [row] = await novelForgeDb()<ForgeProjectRow[]>`
    SELECT id::text, owner_kind AS "ownerKind", owner_id::text AS "ownerId", organisation_id::text AS "organisationId", shared_with_org AS "sharedWithOrg",
           content_mode AS "contentMode", cost_tier AS "costTier", config
    FROM projects WHERE id = ${projectId}
  `;
  return row;
}

/** A bare project row, for owners that cannot create one through the API (a read-only bot, an owner id shared across kinds). */
export async function insertProject(seed: ForgeProjectSeed): Promise<string> {
  const sql = novelForgeDb();
  const name = seed.name ?? `e2e-forge-seeded-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO projects (owner_kind, owner_id, organisation_id, shared_with_org, name, kind, content_mode, cost_tier)
    VALUES (
      ${seed.owner.kind}::owner_kind, ${seed.owner.id}, ${seed.organisationId ?? null}, ${seed.sharedWithOrg ?? seed.owner.kind === 'bot'}, ${name}, 'new_novel',
      ${seed.contentMode ?? 'standard'}::content_mode, ${seed.costTier ?? 'balanced'}::cost_tier
    )
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`project insert for ${seed.owner.kind} ${seed.owner.id} returned no row`);
  return row.id;
}

export async function updateProjectOwnership(projectId: string, patch: ProjectOwnershipPatch): Promise<void> {
  const sql = novelForgeDb();
  const fields = {
    owner_kind: patch.owner?.kind,
    owner_id: patch.owner?.id,
    organisation_id: patch.organisationId,
    shared_with_org: patch.sharedWithOrg,
  };
  const columns = Object.entries(fields).filter(([, value]) => value !== undefined);
  if (columns.length === 0) return;
  await sql`UPDATE projects SET ${sql(Object.fromEntries(columns))} WHERE id = ${projectId}`;
}

/** Removes the projects and everything that cascades with them, plus the tool calls, which hang off a run id with no foreign key. */
export async function deleteForgeProjects(projectIds: readonly string[]): Promise<void> {
  if (projectIds.length === 0) return;
  const sql = novelForgeDb();
  await sql`DELETE FROM tool_calls WHERE run_id IN (SELECT id::text FROM workflow_runs WHERE project_id = ANY(${projectIds}::bigint[]))`;
  await sql`DELETE FROM authoring_claims WHERE project_id = ANY(${projectIds}::bigint[])`;
  await sql`DELETE FROM projects WHERE id = ANY(${projectIds}::bigint[])`;
}

export async function listProjectIdsOwnedBy(owner: ForgeOwner): Promise<string[]> {
  const rows = await novelForgeDb()<{ id: string }[]>`SELECT id::text FROM projects WHERE owner_kind = ${owner.kind}::owner_kind AND owner_id = ${owner.id}`;
  return rows.map(row => row.id);
}

export async function deleteForgeProjectsOwnedBy(owner: ForgeOwner): Promise<void> {
  await deleteForgeProjects(await listProjectIdsOwnedBy(owner));
}

/** An owner's saved settings outlive the identity account, since nothing cascades across the two databases. */
export async function deleteAccountSettings(owner: ForgeOwner): Promise<void> {
  await novelForgeDb()`DELETE FROM account_settings WHERE owner_kind = ${owner.kind}::owner_kind AND owner_id = ${owner.id}`;
}

export async function readAccountDefaultCostTier(owner: ForgeOwner): Promise<ForgeCostTier | undefined> {
  const [row] = await novelForgeDb()<{ tier: ForgeCostTier }[]>`
    SELECT default_cost_tier AS tier FROM account_settings WHERE owner_kind = ${owner.kind}::owner_kind AND owner_id = ${owner.id}
  `;
  return row?.tier;
}

export async function insertModelCalls(seeds: readonly ModelCallSeed[]): Promise<string[]> {
  const ids: string[] = [];
  for (const seed of seeds) {
    const [row] = await novelForgeDb()<{ id: string }[]>`
      INSERT INTO model_calls (
        project_id, run_id, node, role, provider, model, prompt_key, prompt_version, status, input_tokens, cached_input_tokens, output_tokens, latency_ms,
        cost_usd, cost_source, tier, content_mode, raw_output, chapter, created_at
      )
      VALUES (
        ${seed.projectId}, ${seed.runId ?? null}, 'e2e', ${seed.role ?? 'generation'}, ${seed.provider ?? 'openrouter'}, ${seed.model ?? FAIL_PIN_MODEL.model}, ${SEEDED_PROMPT_KEY}, '1.0.0',
        ${seed.status ?? 'ok'}::model_call_status, ${seed.inputTokens ?? null}, ${seed.cachedInputTokens ?? null}, ${seed.outputTokens ?? null}, ${seed.latencyMs ?? null},
        ${seed.costUsd ?? null}, ${seed.costSource ?? null}::cost_source, ${seed.tier ?? null}::cost_tier, ${seed.contentMode ?? null}::content_mode, ${seed.rawOutput ?? null},
        ${seed.chapter ?? null}, now() - ${ago(seed.ageMs)}::interval
      )
      RETURNING id::text
    `;
    if (!row) throw new ForgeDbError(`model call insert on project ${seed.projectId} returned no row`);
    ids.push(row.id);
  }
  return ids;
}

/** `count` identical calls in one statement — what standing an owner at a quota ceiling takes. */
export async function insertModelCallBatch(count: number, seed: ModelCallSeed): Promise<void> {
  if (count <= 0) return;
  await novelForgeDb()`
    INSERT INTO model_calls (project_id, run_id, node, role, provider, model, prompt_key, prompt_version, status, input_tokens, output_tokens, cost_usd, cost_source, created_at)
    SELECT ${seed.projectId}, ${seed.runId ?? null}, 'e2e', ${seed.role ?? 'generation'}, ${seed.provider ?? 'openrouter'}, ${seed.model ?? FAIL_PIN_MODEL.model}, ${SEEDED_PROMPT_KEY}, '1.0.0',
           ${seed.status ?? 'ok'}::model_call_status, ${seed.inputTokens ?? null}, ${seed.outputTokens ?? null}, ${seed.costUsd ?? null}, ${seed.costSource ?? null}::cost_source,
           now() - ${ago(seed.ageMs)}::interval
    FROM generate_series(1, ${count})
  `;
}

export async function deleteModelCalls(projectId: string): Promise<void> {
  await novelForgeDb()`DELETE FROM model_calls WHERE project_id = ${projectId}`;
}

/** Every model call recorded on the project, seeded ones included, each with the model it went to. */
export async function listModelCallModels(projectId: string): Promise<string[]> {
  const rows = await novelForgeDb()<{ model: string }[]>`SELECT model FROM model_calls WHERE project_id = ${projectId} ORDER BY id`;
  return rows.map(row => row.model);
}

/** The model calls the server itself recorded on the project — how a spec proves nothing was dispatched past a quota pin. */
export async function listDispatchedModelCalls(projectId: string): Promise<string[]> {
  const rows = await novelForgeDb()<{ model: string }[]>`
    SELECT model FROM model_calls WHERE project_id = ${projectId} AND prompt_key NOT IN (${SEEDED_PROMPT_KEY}, ${QUOTA_PIN_PROMPT_KEY}) ORDER BY id
  `;
  return rows.map(row => row.model);
}

/** The caller's own quota window as the server reports it, uncached. */
async function fetchQuota(ctx: APIRequestContext): Promise<QuotaLimits & { calls: number }> {
  const response = await ctx.get('/api/v1/ai/quota');
  if (!response.ok()) throw new SpendGuardError(`reading the quota window answered ${response.status()}: ${await response.text()}`);
  const { calls, maxCalls, maxCostUsd, windowMs } = (await response.json()) as QuotaLimits & { calls: number };
  return { calls, maxCalls, maxCostUsd, windowMs };
}

/** The server's quota window, read once per worker through any signed-in person (a bot is refused `/ai/quota`); disabled limits are refused. */
export function readQuotaLimits(reader: () => Promise<APIRequestContext>): Promise<QuotaLimits> {
  quotaLimits ??= (async () => {
    const { maxCalls, maxCostUsd, windowMs } = await fetchQuota(await reader());
    if (maxCalls <= 0) throw new SpendGuardError('the AI call ceiling is disabled, so no quota pin can hold');
    if (windowMs <= QUOTA_PIN_MARGIN_MS) throw new SpendGuardError(`a ${windowMs} ms quota window is too short to pin`);
    return { maxCalls, maxCostUsd, windowMs };
  })().catch(error => {
    quotaLimits = undefined;
    throw error;
  });
  return quotaLimits;
}

/** Calls counted against the project owner that stay inside the window for at least the pin margin. */
async function countFreshOwnerCalls(projectId: string, limits: QuotaLimits): Promise<number> {
  const [row] = await novelForgeDb()<{ calls: number }[]>`
    SELECT count(*)::int AS calls
    FROM model_calls c JOIN projects p ON p.id = c.project_id
    JOIN projects target ON target.owner_kind = p.owner_kind AND target.owner_id = p.owner_id
    WHERE target.id = ${projectId} AND c.created_at >= now() - ${ago(limits.windowMs - QUOTA_PIN_MARGIN_MS)}::interval
  `;
  return row?.calls ?? 0;
}

/**
 * Tops the owner's window up to the AI_008 call ceiling with zero-cost rows on `projectId`, so every model-capable request by any project of
 * that owner is refused before routing. The rows cascade with the project and age out after one window. Only an owner in `scope.owners` —
 * one the caller created and tears down — may be pinned: a pin on anyone else would block their AI for a whole window, in every lane.
 */
export async function quotaPin(projectId: string, limits: QuotaLimits, scope: QuotaPinScope): Promise<void> {
  const project = await readProjectRow(projectId);
  if (!project) throw new ForgeDbError(`no project ${projectId} to quota-pin`);
  const owner = scope.owners.find(candidate => candidate.kind === project.ownerKind && candidate.id === project.ownerId);
  if (!owner)
    throw new SpendGuardError(`project ${projectId} belongs to ${project.ownerKind} ${project.ownerId ?? '(none)'}, whom this test did not create: refusing to pin their quota`);

  const counted = await countFreshOwnerCalls(projectId, limits);
  const missing = limits.maxCalls - counted;
  if (missing > 0) {
    await novelForgeDb()`
      INSERT INTO model_calls (project_id, node, role, provider, model, prompt_key, prompt_version, status, cost_usd, cost_source)
      SELECT ${projectId}, 'e2e', 'generation', ${FAIL_PIN_MODEL.provider}, ${FAIL_PIN_MODEL.model}, ${QUOTA_PIN_PROMPT_KEY}, '1.0.0', 'ok', 0, 'provider'
      FROM generate_series(1, ${missing})
    `;
  }
  const pinned = await countFreshOwnerCalls(projectId, limits);
  if (pinned < limits.maxCalls) throw new SpendGuardError(`project ${projectId}'s owner stands at ${pinned} of ${limits.maxCalls} calls after the quota pin`);
  quotaPins.set(projectId, { limits, reader: scope.reader, ownerCtx: scope.ownerCtx?.(owner) });
}

/**
 * Throws unless a model-capable request on the project would be refused before dispatch: its owner still stands at the call ceiling
 * (when it was quota-pinned), or, failing that, it is a standard project still fail-pinned on every role. `requireQuota` refuses a
 * fail-pin alone. An unrestricted project is guarded by the quota pin only. A pin is re-checked against the server's limits read afresh
 * and, for a person, against the server's own count of their calls.
 */
export async function assertSpendGuarded(projectId: string, options: { requireQuota?: boolean } = {}): Promise<void> {
  const project = await readProjectRow(projectId);
  if (!project) throw new ForgeDbError(`no project ${projectId} to guard`);

  const pin = quotaPins.get(projectId);
  const limits = pin?.limits;
  if (pin) {
    const counted = await countFreshOwnerCalls(projectId, pin.limits);
    if (counted < pin.limits.maxCalls) throw new SpendGuardError(`project ${projectId}'s quota pin lapsed: its owner stands at ${counted} of ${pin.limits.maxCalls} calls`);
    const current = await fetchQuota(await pin.reader());
    if (current.maxCalls !== pin.limits.maxCalls || current.windowMs !== pin.limits.windowMs) {
      throw new SpendGuardError(
        `the server's quota window is now ${current.maxCalls} calls / ${current.windowMs} ms, not the ${pin.limits.maxCalls} / ${pin.limits.windowMs} pinned`,
      );
    }
    const seen = pin.ownerCtx ? await fetchQuota(pin.ownerCtx) : undefined;
    if (seen && seen.calls < pin.limits.maxCalls) throw new SpendGuardError(`the server counts ${seen.calls} of ${pin.limits.maxCalls} calls for project ${projectId}'s owner`);
  }
  if (!limits && options.requireQuota) throw new SpendGuardError(`project ${projectId} is not quota-pinned`);
  if (limits && project.contentMode === 'unrestricted') return;
  if (!limits && project.contentMode !== 'standard') throw new SpendGuardError(`project ${projectId} is unrestricted and not quota-pinned: nothing stops a real dispatch`);

  const unpinned = AI_ROLES.filter(role => project.config?.models?.[role]?.model !== FAIL_PIN_MODEL.model);
  if (unpinned.length > 0 && !limits) throw new SpendGuardError(`project ${projectId} is neither quota-pinned nor fail-pinned for ${unpinned.join(', ')}`);
}

export async function insertWorkflowRun(seed: WorkflowRunSeed): Promise<string> {
  const status = seed.status ?? 'completed';
  const startedAgoMs = seed.startedAgoMs ?? 0;
  const endedAgoMs = seed.endedAgoMs ?? (status === 'running' ? undefined : startedAgoMs);
  const [row] = await novelForgeDb()<{ id: string }[]>`
    INSERT INTO workflow_runs (project_id, job_id, graph, target, status, outcome, context_pack_id, parent_run_id, started_at, ended_at)
    VALUES (
      ${seed.projectId}, ${seed.jobId ?? null}, ${seed.graph}, ${seed.target ?? 'e2e'}, ${status}::workflow_run_status, ${seed.outcome ?? null}, ${seed.contextPackId ?? null},
      ${seed.parentRunId ?? null}, now() - ${ago(startedAgoMs)}::interval, now() - ${endedAgoMs === undefined ? null : ago(endedAgoMs)}::interval
    )
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`workflow run insert on project ${seed.projectId} returned no row`);
  return row.id;
}

export async function readWorkflowRun(runId: string): Promise<WorkflowRunRow | undefined> {
  const [row] = await novelForgeDb()<WorkflowRunRow[]>`SELECT id::text, status, outcome, ended_at AS "endedAt" FROM workflow_runs WHERE id = ${runId}`;
  return row;
}

export async function insertToolCall(seed: ToolCallSeed): Promise<string> {
  const [row] = await novelForgeDb()<{ id: string }[]>`
    INSERT INTO tool_calls (run_id, model_call_id, node, tool, status, latency_ms)
    VALUES (${seed.runId}, ${seed.modelCallId ?? null}, ${seed.node ?? 'e2e'}, ${seed.tool ?? 'e2e_lookup'}, ${seed.status ?? 'ok'}::tool_call_status, ${seed.latencyMs ?? null})
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`tool call insert on run ${seed.runId} returned no row`);
  return row.id;
}

export async function insertContextPack(seed: ContextPackSeed): Promise<string> {
  const sql = novelForgeDb();
  const hash = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const usedTokens = seed.usedTokens ?? seed.sections.reduce((total, section) => total + section.tokens, 0);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO context_packs (project_id, purpose, chapter, hash, budget_tokens, used_tokens, sections, rendered)
    VALUES (${seed.projectId}, ${seed.purpose}, ${seed.chapter ?? null}, ${hash}, ${seed.budgetTokens ?? usedTokens}, ${usedTokens}, ${sql.json(seed.sections as never)}, ${seed.rendered})
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`context pack insert on project ${seed.projectId} returned no row`);
  return row.id;
}

async function writeJob(sql: Sql | TransactionSql, seed: JobSeed): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO jobs (project_id, kind, target, status, payload)
    VALUES (${seed.projectId}, ${seed.kind}::job_kind, ${seed.target}, ${seed.status ?? 'pending'}::job_status, ${seed.payload ? sql.json(seed.payload as never) : null})
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`job insert on project ${seed.projectId} returned no row`);
  return row.id;
}

async function writeAuthoringClaim(sql: Sql | TransactionSql, projectId: string, options: AuthoringClaimOptions): Promise<void> {
  await sql`
    INSERT INTO authoring_claims (project_id, job_id, kind, claimed_by, claimed_at, heartbeat_at)
    VALUES (
      ${projectId}, ${options.jobId ?? null}, ${options.kind ?? 'generate'}::job_kind, ${options.jobId ? null : 'e2e'}, timezone('utc', now()),
      timezone('utc', now()) - ${ago(options.heartbeatAgoMs)}::interval
    )
    ON CONFLICT (project_id) DO UPDATE SET job_id = EXCLUDED.job_id, kind = EXCLUDED.kind, claimed_by = EXCLUDED.claimed_by, claimed_at = EXCLUDED.claimed_at,
      heartbeat_at = EXCLUDED.heartbeat_at
  `;
}

/**
 * A job row. A pending authoring job is re-dispatched by the janitor within one claim TTL unless a reservation names it (`insertReservedJob`,
 * or `holdAuthoringClaim` with its id), and again once that reservation's heartbeat goes stale; pending non-authoring jobs run at the next
 * boot. So a live model-capable job is refused unless the project is quota-pinned.
 */
export async function insertJob(seed: JobSeed): Promise<string> {
  if (MODEL_CAPABLE_JOB_KINDS.includes(seed.kind) && LIVE_JOB_STATUSES.includes(seed.status ?? 'pending')) await assertSpendGuarded(seed.projectId, { requireQuota: true });
  return writeJob(novelForgeDb(), seed);
}

/** A pending authoring job and the reservation enqueueing takes for it, written together as the server writes them; it needs a quota pin. */
export async function insertReservedJob(seed: Omit<JobSeed, 'status'>): Promise<string> {
  await assertSpendGuarded(seed.projectId, { requireQuota: true });
  return novelForgeDb().begin(async tx => {
    const jobId = await writeJob(tx, seed);
    await writeAuthoringClaim(tx, seed.projectId, { jobId, kind: seed.kind });
    return jobId;
  });
}

/** Holds the project's one authoring claim, replacing any claim already there — a job-less holder's, or a job's reservation, which needs a quota pin. */
export async function holdAuthoringClaim(projectId: string, options: AuthoringClaimOptions = {}): Promise<void> {
  if (options.jobId) await assertSpendGuarded(projectId, { requireQuota: true });
  await writeAuthoringClaim(novelForgeDb(), projectId, options);
}

export async function releaseAuthoringClaim(projectId: string): Promise<void> {
  await novelForgeDb()`DELETE FROM authoring_claims WHERE project_id = ${projectId}`;
}
