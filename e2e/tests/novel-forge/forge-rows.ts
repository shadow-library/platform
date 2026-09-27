/**
 * Importing user defined packages
 */
import { novelForgeDb } from '../../lib';
import { ForgeDbError, type JobKind, type JobStatus } from './forge-db';

/**
 * Defining types
 */

export type JobEventType = 'queued' | 'started' | 'step' | 'retrying' | 'done' | 'failed' | 'cancelled';

export interface JobRow {
  readonly id: string;
  readonly status: JobStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly payload: Record<string, unknown> | null;
  readonly cancelRequestedAt: Date | null;
}

export interface JobRowPatch {
  status?: JobStatus;
  attempts?: number;
  lastError?: string | null;
  cancelRequested?: boolean;
}

export interface JobEventSeed {
  readonly jobId: string;
  readonly type: JobEventType;
  readonly data?: Record<string, unknown>;
}

export interface AuthoringClaimRow {
  readonly jobId: string | null;
  readonly kind: JobKind;
  readonly claimedBy: string | null;
  readonly heartbeatAt: Date;
}

export interface WriterSnapshotSeed {
  projectId: string;
  chapter: number;
  isolated: boolean;
  messages: { role: string; content: string }[];
  bibleHash?: string | null;
}

export interface WorkflowRunSummary {
  readonly id: string;
  readonly graph: string;
  readonly status: string;
}

/**
 * Declaring the constants
 *
 * Arrange-and-assert rows for the stream, job and claim specs, beside `forge-db.ts` rather than in it so parallel lanes never edit one
 * file. Job events are what a chat's job stream replays, keyed by the session's `job_event_seq` cursor.
 */

/** A held slot rolls itself back after this even if the test never releases it, and the database ends the transaction soon after. */
const HELD_SLOT_MAX_MS = 20_000;

class HeldLockRelease extends Error {
  override readonly name = 'HeldLockRelease';
}

/** The origin a job started from a chat card carries; the chat's job routes find their jobs by it. */
export function chatOrigin(sessionId: string): Record<string, unknown> {
  return { origin: { sessionId, messageId: null, proposalId: '1', opIndex: 0 } };
}

export async function readJobRow(jobId: string): Promise<JobRow | undefined> {
  const [row] = await novelForgeDb()<JobRow[]>`
    SELECT id::text, status, attempts, last_error AS "lastError", payload, cancel_requested_at AS "cancelRequestedAt" FROM jobs WHERE id = ${jobId}
  `;
  return row;
}

export async function updateJobRow(jobId: string, patch: JobRowPatch): Promise<void> {
  const sql = novelForgeDb();
  const fields = {
    status: patch.status,
    attempts: patch.attempts,
    last_error: patch.lastError,
    cancel_requested_at: patch.cancelRequested === undefined ? undefined : patch.cancelRequested ? new Date() : null,
    updated_at: new Date(),
  };
  const columns = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  const updated = await sql`UPDATE jobs SET ${sql(columns)} WHERE id = ${jobId} RETURNING id`;
  if (updated.length === 0) throw new ForgeDbError(`no job ${jobId} to update`);
}

/** Appends events to a chat's job log in the order given, numbered on from the session's cursor, and advances the cursor past them. */
export async function appendJobEvents(projectId: string, sessionId: string, events: readonly JobEventSeed[]): Promise<number[]> {
  const sql = novelForgeDb();
  return sql.begin(async tx => {
    const [session] = await tx<{ seq: number }[]>`SELECT job_event_seq AS seq FROM chat_sessions WHERE id = ${sessionId} AND project_id = ${projectId} FOR UPDATE`;
    if (!session) throw new ForgeDbError(`no chat session ${sessionId} on project ${projectId}`);
    const seqs = events.map((_, index) => session.seq + index + 1);
    for (const [index, event] of events.entries()) {
      await tx`
        INSERT INTO job_events (job_id, project_id, session_id, seq, type, data)
        VALUES (${event.jobId}, ${projectId}, ${sessionId}, ${seqs[index] ?? 0}, ${event.type}::job_event_type, ${event.data ? tx.json(event.data as never) : null})
      `;
    }
    await tx`UPDATE chat_sessions SET job_event_seq = ${session.seq + events.length} WHERE id = ${sessionId}`;
    return seqs;
  });
}

export async function readAuthoringClaim(projectId: string): Promise<AuthoringClaimRow | undefined> {
  const [row] = await novelForgeDb()<AuthoringClaimRow[]>`
    SELECT job_id::text AS "jobId", kind, claimed_by AS "claimedBy", heartbeat_at AS "heartbeatAt" FROM authoring_claims WHERE project_id = ${projectId}
  `;
  return row;
}

/** Backdates the claim's heartbeat, as a holder that stopped heartbeating would leave it. */
export async function ageAuthoringClaim(projectId: string, heartbeatAgoMs: number): Promise<void> {
  await novelForgeDb()`
    UPDATE authoring_claims SET heartbeat_at = timezone('utc', now()) - ${`${Math.round(heartbeatAgoMs)} milliseconds`}::interval WHERE project_id = ${projectId}
  `;
}

export async function insertWriterSnapshot(seed: WriterSnapshotSeed): Promise<string> {
  const sql = novelForgeDb();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO writer_snapshots (project_id, chapter, draft_revision, attempt, role, messages, bible_hash, prompt_key, prompt_version, model_route, isolated)
    VALUES (
      ${seed.projectId}, ${seed.chapter}, 1, 1, 'draft', ${sql.json(seed.messages as never)}, ${seed.bibleHash ?? null}, 'e2e-seed', '1.0.0',
      ${sql.json({ provider: 'openrouter', model: 'e2e/unregistered' } as never)}, ${seed.isolated}
    )
    RETURNING id::text
  `;
  if (!row) throw new ForgeDbError(`writer snapshot insert on project ${seed.projectId} returned no row`);
  return row.id;
}

export async function listWorkflowRuns(projectId: string, graph: string): Promise<WorkflowRunSummary[]> {
  return novelForgeDb()<WorkflowRunSummary[]>`SELECT id::text, graph, status FROM workflow_runs WHERE project_id = ${projectId} AND graph = ${graph} ORDER BY started_at`;
}

/**
 * Holds the chat's next message slot in an open transaction, so a turn that has started and answered with its run id blocks on storing
 * the author's message until the returned release rolls the hold back. Without it a quota-refused turn settles before any client connects.
 */
export async function holdNextChatMessage(projectId: string, sessionId: string): Promise<() => Promise<void>> {
  let release: () => void = () => undefined;
  const released = new Promise<void>(resolve => (release = resolve));
  let held: (error?: unknown) => void = () => undefined;
  const holding = new Promise<void>((resolve, reject) => (held = error => (error === undefined ? resolve() : reject(error))));

  let failure: unknown;
  const autoRelease = setTimeout(release, HELD_SLOT_MAX_MS);
  const transaction = novelForgeDb()
    .begin(async tx => {
      await tx.unsafe(`SET LOCAL idle_in_transaction_session_timeout = '${HELD_SLOT_MAX_MS + 5_000}ms'`);
      await tx`
        INSERT INTO chat_messages (session_id, project_id, ordinal, role, content)
        SELECT ${sessionId}, ${projectId}, coalesce(max(ordinal), 0) + 1, 'user', 'e2e-held-slot' FROM chat_messages WHERE session_id = ${sessionId}
      `;
      held();
      await released;
      throw new HeldLockRelease();
    })
    .catch((error: unknown) => {
      if (error instanceof HeldLockRelease) return;
      failure = error;
      held(error);
    })
    .finally(() => clearTimeout(autoRelease));

  await holding;
  return async () => {
    release();
    await transaction;
    if (failure) throw failure;
  };
}

/** Marks a chapter's draft and every version of it isolated, as pasting it with `isolated: true` stores it. */
export async function markDraftIsolated(projectId: string, chapter: number): Promise<void> {
  const sql = novelForgeDb();
  const [draft] = await sql<{ id: string }[]>`UPDATE drafts SET isolated = true WHERE project_id = ${projectId} AND chapter = ${chapter} RETURNING id::text`;
  if (!draft) throw new ForgeDbError(`no draft of chapter ${chapter} on project ${projectId} to isolate`);
  await sql`UPDATE draft_revisions SET isolated = true WHERE draft_id = ${draft.id}`;
}
