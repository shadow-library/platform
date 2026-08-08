import { type Job } from '@server/database';

/**
 * `import` jobs carry the whole bundle (every chapter's prose plus a base64 cover, up to the
 * novel-import size limit) in `payload` — real novel content, not job bookkeeping like every other
 * job kind's payload (a chapter-number list, a guidance string, …). Every read-facing endpoint that
 * serializes a job row (`GET /api/v1/jobs/:jobId`, the per-project job listing) must never echo it
 * back verbatim: this collapses it to a small summary, unconditionally — regardless of whether the
 * job is still running (full payload still in the row) or already compacted on the DB side by
 * `JobExecutor.runImport` on success — so a poll can never leak megabytes of prose over the wire.
 * Every other job kind's payload passes through untouched; it was never the leak.
 */
export function redactJobForResponse<T extends Job.Row>(job: T): T {
  if (job.kind !== 'import' || !job.payload || typeof job.payload !== 'object') return job;
  const payload = job.payload as { chapters?: unknown; cover?: unknown; hasCover?: unknown };
  // Handles both shapes: the full in-flight payload (`chapters` is the array, `cover` the asset object)
  // while the job is still running, and the already-compacted summary `runImport` writes back on
  // success (`chapters` is already the count, `hasCover` already the flag) — same output either way.
  const chapters = Array.isArray(payload.chapters) ? payload.chapters.length : typeof payload.chapters === 'number' ? payload.chapters : 0;
  const hasCover = typeof payload.hasCover === 'boolean' ? payload.hasCover : !!payload.cover;
  return { ...job, payload: { chapters, hasCover } };
}
