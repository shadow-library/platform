import { type ApiError, type ChapterRowResponse, type DraftResponse, type FinalizeReadinessResponse, type JobEnqueueResponse } from '@/lib/apis';
import { approvalRefusal } from '@/lib/chapter-checks';

const TEACHING_GATE_CODE = 'DRF_016';
const REVEAL_STALE_CODE = 'DRF_017';
const MOVED_CODE = 'DRF_013';

export type WorkspaceDraft = Pick<DraftResponse, 'chapter' | 'status' | 'reviewStatus' | 'revision' | 'approvedRevision' | 'staleReason' | 'body'>;

export interface WorkspaceActions {
  edit: boolean;
  approve: boolean;
  approveAsWritten: boolean;
  finalize: boolean;
  amend: boolean;
  verify: boolean;
  askForge: boolean;
}

/**
 * A final chapter is locked: only Amend writes to it, so every other writer is withdrawn rather than left to be refused. Reviewing it never writes, so Verify stays.
 * A contradiction is approvable only while the current judge review holds it with open blocking findings (`blocking`), which the approval records
 * as overridden; one no current review explains has nothing to override, so Approve stays withheld until the AI review is run.
 */
export function workspaceActions(draft: WorkspaceDraft, generating: boolean, blocking = 0): WorkspaceActions {
  const verify = Boolean(draft.body?.trim());
  if (draft.status === 'final') return { edit: false, approve: false, approveAsWritten: false, finalize: false, amend: true, verify, askForge: false };
  const writable = !generating;
  const stale = Boolean(draft.staleReason);
  const approvable = writable && draft.reviewStatus !== 'generating' && draft.reviewStatus !== 'approved' && !approvalRefusal(draft.reviewStatus, blocking);
  return {
    edit: writable,
    approve: approvable && !stale,
    approveAsWritten: approvable && stale,
    finalize: draft.reviewStatus === 'approved',
    amend: false,
    verify,
    askForge: true,
  };
}

type ApprovalView = Pick<DraftResponse, 'status' | 'reviewStatus' | 'revision' | 'approvedRevision'>;

/** The version the author approved, when the text on screen has changed since. */
export function changedSinceApproval(draft: ApprovalView): number | undefined {
  if (draft.status === 'final' || draft.reviewStatus === 'approved' || draft.approvedRevision === null) return undefined;
  return draft.approvedRevision < draft.revision ? draft.approvedRevision : undefined;
}

export function statusLabel(draft: ApprovalView): string | undefined {
  if (draft.status === 'final') return 'Final · locked';
  if (draft.reviewStatus === 'approved') return `Approved · version ${draft.approvedRevision ?? draft.revision}`;
  if (changedSinceApproval(draft) !== undefined) return 'Changed';
  return undefined;
}

/** Why finalize would refuse now, in the server's order; nothing while the answer is loading or failed, so the server's own refusal speaks on click. */
export function finalizeBlockerMessages(readiness: FinalizeReadinessResponse | undefined): string[] {
  if (!readiness || readiness.ready) return [];
  return readiness.blockers.length > 0 ? readiness.blockers.map(blocker => blocker.message) : ['Finalize isn’t available for this chapter right now.'];
}

/** The approval was refused because the text moved since the author read it. */
export function approvalMoved(error: ApiError): boolean {
  return error.code === MOVED_CODE;
}

export function approveAsWrittenRefused(error: ApiError): boolean {
  return error.code === REVEAL_STALE_CODE;
}

/** The AI refused a chapter because an earlier one teaches its characters something and is not approved yet. */
export function teachingGateRefusal(error: ApiError): string | undefined {
  return error.code === TEACHING_GATE_CODE ? error.message : undefined;
}

/** Why a batch wrote fewer chapters than asked, if it did. */
export function batchStopNotice(job: Pick<JobEnqueueResponse, 'stoppedAtExternalChapter' | 'stoppedAtUnwrittenChapter' | 'stoppedAtTeachingChapter'>): string | undefined {
  if (job.stoppedAtExternalChapter) return `Batch stopped at chapter ${job.stoppedAtExternalChapter} — it is written outside the primary model`;
  if (job.stoppedAtUnwrittenChapter) return `Batch stopped at chapter ${job.stoppedAtUnwrittenChapter} — it has no draft yet`;
  if (job.stoppedAtTeachingChapter) {
    const chapter = job.stoppedAtTeachingChapter;
    return `Batch stopped after chapter ${chapter} — its characters learn something there, so the AI writes chapter ${chapter + 1} once you approve it`;
  }
  return undefined;
}

/** Rows carry no revision; a new revision is what puts an approved draft back to needs-review, so that plus an approval on record means it changed since. */
export function rowChangedSinceApproval(row: Pick<ChapterRowResponse, 'status' | 'reviewStatus' | 'approvedRevision'>): boolean {
  return row.status !== 'final' && row.reviewStatus === 'needs_review' && row.approvedRevision != null;
}
