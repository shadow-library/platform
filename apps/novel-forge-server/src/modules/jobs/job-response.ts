import { type Job } from '@server/database';

import { type CallUsageTotals } from '../ai/usage/call-usage';
import { type JobUsageResponse } from './jobs.dto';

export function toJobUsageResponse(totals: CallUsageTotals): JobUsageResponse {
  return {
    calls: totals.calls,
    inputTokens: totals.inputTokens,
    cachedInputTokens: totals.cachedInputTokens,
    outputTokens: totals.outputTokens,
    costUsd: totals.costUsd,
    estimatedCostUsd: totals.estimatedCostUsd,
    byCostSource: totals.byCostSource.map(({ costSource, calls, costUsd }) => ({ costSource, calls, costUsd })),
  };
}

/**
 * An `import` job carries the whole bundle (every chapter's prose plus a base64 cover) in `payload` — novel content, not job bookkeeping like every other kind.
 * Every read-facing endpoint serializing a job row must collapse it to a small summary unconditionally, whether the job is running or already compacted by `JobExecutor.runImport`,
 * so a poll never leaks megabytes of prose. Other kinds' payloads pass through untouched.
 */
export function redactJobForResponse<T extends Job.Row>(job: T): T {
  if (job.kind !== 'import' || !job.payload || typeof job.payload !== 'object') return job;
  const payload = job.payload as { chapters?: unknown; cover?: unknown; hasCover?: unknown };
  // Handles both the full in-flight payload (`chapters` an array, `cover` the asset) and the compacted summary `runImport` writes back (`chapters` already the count,
  // `hasCover` the flag).
  const chapters = Array.isArray(payload.chapters) ? payload.chapters.length : typeof payload.chapters === 'number' ? payload.chapters : 0;
  const hasCover = typeof payload.hasCover === 'boolean' ? payload.hasCover : !!payload.cover;
  return { ...job, payload: { chapters, hasCover } };
}
