/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { type APIRequestContext, type APIResponse, expect as playwrightExpect } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { mutate, novelForgeDb } from '../../lib';
import { expect } from './forge-actors';
import { ForgeDbError } from './forge-db';

/**
 * Defining types
 */

export type ChapterRowStatus = 'done' | 'failed' | 'skipped';

export interface ChapterRowSeed {
  projectId: string;
  number: number;
  status?: ChapterRowStatus;
  locked?: boolean;
  needsRevalidation?: boolean;
  title?: string;
  content?: string;
}

export interface ChapterFlags {
  readonly needsRevalidation: boolean;
  readonly locked: boolean;
  readonly status: ChapterRowStatus;
}

export interface PendingProposalSeed {
  projectId: string;
  scopeType: 'project' | 'novel' | 'bible_document' | 'volume' | 'brief';
  kind: 'chat' | 'hub' | 'premise_enhance' | 'bible_audit' | 'chapter_extract' | 'plugin' | 'chapter_plan' | 'organise';
  scopeRef?: string | null;
  sessionId?: string | null;
  changeSet?: readonly Record<string, unknown>[];
  baseline?: Record<string, unknown>;
  summary?: string | null;
  /**
   * An `organise`-kind proposal without one refuses to apply (`NTS_009`, `organise-record.ts:32`) — pass `{ legacy: true }`
   * (`LEGACY_ORGANISE_RECORD`) to arrange one that applies like any other card, bypassing the real organise pass's own
   * reconciliation bookkeeping.
   */
  organiseRecord?: Record<string, unknown> | null;
}

export interface ProposalRow {
  readonly id: string;
  readonly status: string;
  readonly changeSet: Record<string, unknown>[];
  readonly baseline: Record<string, unknown>;
  readonly inverseOps: Record<string, unknown>[] | null;
  readonly postState: Record<string, unknown> | null;
  readonly opResults: Record<string, unknown>[] | null;
  readonly error: Record<string, unknown> | null;
  readonly autoApplied: boolean;
}

export interface ValidationReportSeed {
  projectId: string;
  findings: readonly Record<string, unknown>[];
  checked: Record<string, unknown>;
  proposalId?: string | null;
  runId?: string | null;
  summary?: string;
  issues?: number;
}

export interface ChatMessageSeed {
  projectId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  runId?: string | null;
}

export interface BibleDocRow {
  readonly revision: number;
  readonly contentHash: string | null;
  readonly updatedAt: Date;
  readonly frontmatter: Record<string, unknown> | null;
  readonly body: string | null;
}

export interface RawBibleDocSeed {
  frontmatter?: Record<string, unknown> | null;
  body?: string | null;
  /** Overrides the stored hash — simulates a row written before title-derivation existed, whose hash predates the fold. */
  contentHash?: string;
  revision?: number;
}

/** Thrown when a test's own arrangement failed to produce what a later step needs — never for an app response. */
export class ForgeArrangeError extends Error {
  override readonly name = 'ForgeArrangeError';
}

/**
 * Declaring the constants
 *
 * Batch-6 arrangers: Story Bible documents/tidy/builder, the proposal engine, bible audits and chat messages — kept beside, not inside,
 * `forge-db.ts`/`forge-rows.ts` so this batch and the other novel-forge lanes never edit the same file. `chapters` rows exist only for
 * finalized chapters, so a bible-doc-edit test that needs to observe `needsRevalidation` on one seeds a bare row directly rather than
 * running a whole hand-write-approve-finalize flow. A pending proposal is likewise seeded bare and then `PATCH`ed through the real API
 * so the server computes its baseline and stamps idea ids.
 */

/** The default handler's generic body for an uncaught server error (`packages/fastify/src/server.error.ts`), what a 500 from the serializer bug below always carries. */
const UNEXPECTED_SERVER_ERROR_CODE = 'S001';

/**
 * `POST /proposals/:id/apply` and `/revert` (`proposal.controller.ts:61,84`) each declare two `@RespondFor` codes with no `@HttpStatus`;
 * `getStatusCode` (`packages/fastify/src/module/fastify-router.ts:322-327`) then defaults the POST to 201 because more than one status is
 * registered, and the 201 has no matching response transformer, so a raw bigint in the body (`ProposalResponse.id`) fails JSON
 * serialization after the write already committed — `500 {"code":"S001"}` (`ac5a7309`).
 *
 * The same shape recurs wherever a *response field* is a nullable bigint that just went non-null: `LedgerEntryResponse.supersedesId`
 * (`ledger.dto.ts:177`) and `BibleAuditReportResponse.proposalId` (`bible-audit.dto.ts:191`) both hit `class-schema`'s nullable/`anyOf`
 * handling (`packages/class-schema/src/class-schema.ts:194-200`) once non-null, 500ing on an otherwise-successful write.
 *
 * Both are pre-existing app bugs, not something a spec should mask by weakening its assertion: this helper accepts only the expected
 * status, or a 500 whose body is exactly the default handler's `S001` — never an unrelated 500 — so a real regression elsewhere still
 * fails the test. Callers always read the committed state back from the database afterward rather than trusting the response body.
 */
export async function expectCommittedDespiteSerializerBug(response: APIResponse, expectedStatus: number, what: string): Promise<void> {
  if (response.status() === expectedStatus) return;
  const body = await response.text();
  playwrightExpect(response.status(), `${what} — neither ${expectedStatus} nor the serializer bug's 500 — body ${body}`).toBe(500);
  const parsed = JSON.parse(body) as { code?: string };
  playwrightExpect(parsed.code, `${what} — a 500 not carrying the serializer bug's own code — body ${body}`).toBe(UNEXPECTED_SERVER_ERROR_CODE);
}

export async function insertChapterRow(seed: ChapterRowSeed): Promise<string> {
  const sql = novelForgeDb();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO chapters (project_id, number, status, locked, needs_revalidation, title, content)
    VALUES (
      ${seed.projectId}, ${seed.number}, ${seed.status ?? 'done'}::chapter_status, ${seed.locked ?? true}, ${seed.needsRevalidation ?? false},
      ${seed.title ?? `Chapter ${seed.number}`}, ${seed.content ?? 'Placeholder canon prose for a seeded chapter row.'}
    )
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`chapter row insert for project ${seed.projectId} returned no row`);
  return row.id;
}

export async function readChapterFlags(projectId: string, number: number): Promise<ChapterFlags | undefined> {
  const [row] = await novelForgeDb()<ChapterFlags[]>`
    SELECT needs_revalidation AS "needsRevalidation", locked, status FROM chapters WHERE project_id = ${projectId} AND number = ${number}
  `;
  return row;
}

export async function insertPendingProposal(seed: PendingProposalSeed): Promise<string> {
  const sql = novelForgeDb();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO refinement_proposals (project_id, session_id, scope_type, scope_ref, kind, status, summary, change_set, baseline, organise_record)
    VALUES (
      ${seed.projectId}, ${seed.sessionId ?? null}, ${seed.scopeType}::chat_scope, ${seed.scopeRef ?? null}, ${seed.kind}::refinement_kind, 'pending'::refinement_proposal_status,
      ${seed.summary ?? null}, ${sql.json((seed.changeSet ?? []) as never)}, ${sql.json((seed.baseline ?? {}) as never)},
      ${seed.organiseRecord === undefined ? null : sql.json(seed.organiseRecord as never)}
    )
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`pending proposal insert for project ${seed.projectId} returned no row`);
  return row.id;
}

export async function readProposalRow(proposalId: string): Promise<ProposalRow | undefined> {
  const [row] = await novelForgeDb()<ProposalRow[]>`
    SELECT id::text, status, change_set AS "changeSet", baseline, inverse_ops AS "inverseOps", post_state AS "postState", op_results AS "opResults", error, auto_applied AS "autoApplied"
    FROM refinement_proposals WHERE id = ${proposalId}
  `;
  return row;
}

export async function countUserFeedback(projectId: string, proposalId: string, disposition: 'approved' | 'rejected'): Promise<number> {
  const [row] = await novelForgeDb()<{ count: number }[]>`
    SELECT count(*)::int AS count FROM user_feedback
    WHERE project_id = ${projectId} AND artifact_type = 'refinement_proposal' AND artifact_ref = ${proposalId} AND disposition = ${disposition}
  `;
  return row?.count ?? 0;
}

export async function insertValidationReport(seed: ValidationReportSeed): Promise<string> {
  const sql = novelForgeDb();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO validation_reports (project_id, scope, issues, summary, payload, findings, checked, run_id, proposal_id)
    VALUES (
      ${seed.projectId}, 'bible'::validation_scope, ${seed.issues ?? seed.findings.length}, ${seed.summary ?? 'e2e-seeded bible audit'}, ${sql.json({} as never)},
      ${sql.json(seed.findings as never)}, ${sql.json(seed.checked as never)}, ${seed.runId ?? null}, ${seed.proposalId ?? null}
    )
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`validation report insert for project ${seed.projectId} returned no row`);
  return row.id;
}

export async function insertChatMessage(seed: ChatMessageSeed): Promise<string> {
  const sql = novelForgeDb();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO chat_messages (session_id, project_id, ordinal, role, content, run_id)
    SELECT ${seed.sessionId}, ${seed.projectId}, coalesce(max(ordinal), 0) + 1, ${seed.role}::chat_message_role, ${seed.content}, ${seed.runId ?? null}
    FROM chat_messages WHERE session_id = ${seed.sessionId}
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`chat message insert for session ${seed.sessionId} returned no row`);
  return row.id;
}

/** Marks a `running` workflow run settled, as its executor would on completion — `insertWorkflowRun` otherwise leaves it open forever. */
export async function settleWorkflowRun(runId: string, status: 'completed' | 'failed' | 'cancelled' = 'completed'): Promise<void> {
  await novelForgeDb()`UPDATE workflow_runs SET status = ${status}::workflow_run_status, ended_at = now() WHERE id = ${runId}`;
}

/** A raw JSON hash of `{frontmatter, body}`, mirroring the server's `computeBibleDocHash` (not whitespace-tolerant). */
export function computeBibleDocHash(frontmatter: unknown, body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ frontmatter: frontmatter ?? null, body: body ?? null }))
    .digest('hex');
}

export async function readBibleDocRow(projectId: string, section: string, slug: string): Promise<BibleDocRow | undefined> {
  const [row] = await novelForgeDb()<BibleDocRow[]>`
    SELECT revision, content_hash AS "contentHash", updated_at AS "updatedAt", frontmatter, body
    FROM bible_documents WHERE project_id = ${projectId} AND section = ${section}::bible_section AND slug = ${slug}
  `;
  return row;
}

/** Writes a bible document row directly, pre-dating the API's title fold — for NF2-BIBDOC-01's "title fold alone is not a content change". */
export async function insertRawBibleDoc(projectId: string, section: string, slug: string, seed: RawBibleDocSeed): Promise<void> {
  const sql = novelForgeDb();
  const frontmatter = seed.frontmatter ?? null;
  const body = seed.body ?? null;
  const contentHash = seed.contentHash ?? computeBibleDocHash(frontmatter, body);
  await sql`
    INSERT INTO bible_documents (project_id, section, slug, frontmatter, body, revision, content_hash)
    VALUES (${projectId}, ${section}::bible_section, ${slug}, ${frontmatter ? sql.json(frontmatter as never) : null}, ${body}, ${seed.revision ?? 1}, ${contentHash})
  `;
}

/** A DB-written chat session with a scope the create API never exposes (`chat_scope` allows more than `'project'`) — for CHT_003. */
export async function insertChatSession(
  projectId: string,
  scopeType: 'project' | 'novel' | 'bible_document' | 'volume' | 'brief',
  scopeRef: string | null = null,
): Promise<string> {
  const [row] = await novelForgeDb()<{ id: string }[]>`
    INSERT INTO chat_sessions (project_id, scope_type, scope_ref, mode) VALUES (${projectId}, ${scopeType}::chat_scope, ${scopeRef}, 'auto'::chat_mode) RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`chat session insert on project ${projectId} returned no row`);
  return row.id;
}

/** Rebaselines a bare-inserted pending proposal through the real API — the server validates the ops, stamps idea ids, and recomputes `baseline`. */
export async function rebaselineProposal(ctx: APIRequestContext, projectId: string, proposalId: string, changeSet: readonly Record<string, unknown>[]): Promise<void> {
  const response = await mutate(ctx, 'patch', `/api/v1/projects/${projectId}/proposals/${proposalId}`, { data: { changeSet } });
  expect(response.status(), `re-baselining a raw-inserted proposal — body ${await response.text()}`).toBe(200);
}

/** The baseline entry a brand-new artifact reads as (`ArtifactState.MISSING_ARTIFACT`, `artifact-state.ts:26`) — for a ref a change-set is about to create. */
export function missingArtifactRef(): Record<string, unknown> {
  return { exists: false, revision: null, contentHash: null };
}

export async function readEntityRow(projectId: string, entityKey: string): Promise<{ id: string; name: string } | undefined> {
  const [row] = await novelForgeDb()<{ id: string; name: string }[]>`SELECT id::text, name FROM entities WHERE project_id = ${projectId} AND entity_key = ${entityKey}`;
  return row;
}

/** A canon fact with a committed knowledge-ledger reveal, so a `fact.remove` op (proposal path or the direct route) meets FCT_003's guard. */
export async function insertLedgeredFact(projectId: string, factKey: string, entityKey: string): Promise<void> {
  const sql = novelForgeDb();
  await sql.begin(async tx => {
    const [entity] = await tx<{ id: string }[]>`
      INSERT INTO entities (project_id, entity_key, type, name) VALUES (${projectId}, ${entityKey}, 'character', ${entityKey})
      ON CONFLICT (project_id, entity_key) DO UPDATE SET name = EXCLUDED.name RETURNING id::text
    `;
    if (!entity) throw new ForgeDbError(`entity insert on project ${projectId} returned no row`);
    const [fact] = await tx<{ id: string }[]>`
      INSERT INTO canon_facts (project_id, fact_key, text) VALUES (${projectId}, ${factKey}, 'e2e seeded secret, ledgered before its scheduled reveal.') RETURNING id::text
    `;
    if (!fact) throw new ForgeDbError(`fact insert on project ${projectId} returned no row`);
    await tx`INSERT INTO character_knowledge (project_id, fact_id, entity_id, learned_in_chapter, source) VALUES (${projectId}, ${fact.id}, ${entity.id}, 1, 'manual')`;
  });
}

/** No route creates a volume directly — only an applied `volume.upsert` proposal, or (here) a direct insert. */
export async function insertVolumeRow(projectId: string, volumeKey: string, title: string): Promise<void> {
  await novelForgeDb()`INSERT INTO volumes (project_id, volume_key, title) VALUES (${projectId}, ${volumeKey}, ${title})`;
}

export interface VolumeRow {
  readonly volumeKey: string;
  readonly title: string | null;
  readonly objective: string | null;
  readonly body: string | null;
  readonly state: string;
  readonly ordinal: number;
}

export async function readVolumeRow(projectId: string, volumeKey: string): Promise<VolumeRow | undefined> {
  const [row] = await novelForgeDb()<VolumeRow[]>`
    SELECT volume_key AS "volumeKey", title, objective, body, state, ordinal FROM volumes WHERE project_id = ${projectId} AND volume_key = ${volumeKey}
  `;
  return row;
}

/** Records a finding decision directly, bypassing `BibleAuditService.decide` — the only way to reach a still-`pending` card with nothing kept (the service auto-discards a card the moment its last finding is skipped). */
export async function insertAuditFindingDecision(reportId: string, findingId: string, decision: 'kept' | 'skipped'): Promise<void> {
  await novelForgeDb()`INSERT INTO validation_finding_decisions (report_id, finding_id, decision) VALUES (${reportId}, ${findingId}, ${decision}::validation_finding_decision)`;
}
