// Track 3 (harness-final-recommendation.md §14) process/telemetry invariant checks — pure functions
// over already-fetched rows (drafts, model_calls, workflow_runs, jobs, validation_reports). No DB access
// here; the CLI script under tests/eval/process-invariants.ts owns the querying.
//
// What each check verifies, and against which P0 fix:
// - Fail-open judge acceptances (P0-1, D1): `chapter-generation.graph.ts`'s judge() node and
//   `generation.service.ts`'s judgeDraft() both set `verdict = judgeResult?.verdict ?? 'evaluation_failed'`
//   — a draft's `judge` column can only read 'consistent' when the judge output parsed successfully, and
//   `evaluation_failed` always routes to `reviewStatus: 'contradiction'` (never a clean accept) via
//   `routeAfterJudge` returning 'awaitReview'. The only way an `evaluation_failed` draft reaches
//   `reviewStatus: 'approved'`/`'final'` is through `GenerationService.approveDraft`, which always inserts
//   a `user_feedback` row with `disposition: 'approved'` in the same transaction. So the fail-open bug
//   the P0 fix removed would show up here as an `evaluation_failed` draft that is approved/final WITHOUT
//   a matching approval row — structurally impossible now, and this check asserts that against real data
//   rather than just trusting the code, per the task brief.
// - `evaluation_failed` rate: straightforward count/percentage of drafts with judge = 'evaluation_failed'.
// - Repair attempts per chapter / patch-cycle counts: `model_calls.node` is 'repairPatch' or
//   'repairRewrite' for every repair-ladder call (see chapter-generation.graph.ts's TelemetryContext
//   values); grouping by `runId` (joined to `workflow_runs.target`, e.g. "chapter-42") gives attempts per
//   chapter. `workflow_runs.nodeTrace` is NOT used here — `workflow-run.service.ts`'s
//   `runChapterGeneration` pushes a hardcoded trace (`assembleContext, draftChapter, persistDraft, judge,
//   finish`) after `graph.invoke` regardless of what the graph actually did (D38 in the recommendation
//   doc calls this out as dishonest), so repair paths never appear there. `model_calls` is the reliable
//   source.
// - Batch halts on findings (P0-5, D5): `job.executor.ts`'s `runGenerate` halts a batch by writing
//   `jobs.progress = { done, total, current, phase: 'awaiting_review', skipped: number[] }` — this module
//   counts `generate` jobs whose stored progress matches that shape.
// - Validation coverage: `novel-validation.graph.ts`'s `persistReport` writes
//   `validation_reports.payload = { windowsRequested, windowsSucceeded, failedRanges, ... }` (P0-2, D2).
// - Stale/briefless generations rejected: NOT checked here — see the CLI script's printed note. A
//   rejected `generate()` call throws an HTTP error (`BRF_001`/`BRF_002`) and nothing is persisted to
//   prove the rejection happened, so this invariant has no queryable trace. It is verified by
//   `tests/bible/arc.spec.ts`'s existing `BRF_001`/`BRF_002` tests instead.

export interface DraftJudgeRow {
  chapter: number;
  judge: string | null;
  reviewStatus: string;
  status: string;
}

export interface ApprovalRow {
  chapter: number;
}

export interface FailOpenViolation {
  chapter: number;
  reviewStatus: string;
  status: string;
  reason: string;
}

export interface FailOpenInvariantReport {
  totalDrafts: number;
  evaluationFailedCount: number;
  violations: FailOpenViolation[];
  holds: boolean;
}

/**
 * Asserts: no draft with `judge = 'evaluation_failed'` ever reached `reviewStatus` 'approved' or 'final',
 * or `status` 'final', without a corresponding human approval row for that chapter. `approvals` is the
 * set of chapters with at least one `user_feedback` row of `disposition = 'approved'`.
 */
export function checkFailOpenInvariant(drafts: DraftJudgeRow[], approvals: ApprovalRow[]): FailOpenInvariantReport {
  const approvedChapters = new Set(approvals.map(a => a.chapter));
  const evaluationFailed = drafts.filter(d => d.judge === 'evaluation_failed');
  const violations: FailOpenViolation[] = [];

  for (const draft of evaluationFailed) {
    const reachedClean = draft.reviewStatus === 'approved' || draft.reviewStatus === 'final' || draft.status === 'final';
    if (reachedClean && !approvedChapters.has(draft.chapter)) {
      violations.push({
        chapter: draft.chapter,
        reviewStatus: draft.reviewStatus,
        status: draft.status,
        reason: 'reached approved/final status with no human approval row on record',
      });
    }
  }

  return { totalDrafts: drafts.length, evaluationFailedCount: evaluationFailed.length, violations, holds: violations.length === 0 };
}

export interface EvaluationFailedRateReport {
  total: number;
  evaluationFailedCount: number;
  rate: number;
}

export function computeEvaluationFailedRate(drafts: { judge: string | null }[]): EvaluationFailedRateReport {
  const evaluationFailedCount = drafts.filter(d => d.judge === 'evaluation_failed').length;
  return { total: drafts.length, evaluationFailedCount, rate: drafts.length === 0 ? 0 : evaluationFailedCount / drafts.length };
}

export interface ModelCallRow {
  runId: string | null;
  node: string | null;
}

export interface RunTargetRow {
  runId: string;
  target: string;
}

const REPAIR_NODES = new Set(['repairPatch', 'repairRewrite']);

export interface ChapterRepairStat {
  chapter: number | null;
  runId: string;
  repairPatchCount: number;
  repairRewriteCount: number;
  totalRepairAttempts: number;
}

export interface RepairStatsReport {
  perRun: ChapterRepairStat[];
  totalRepairAttempts: number;
  runsWithRepairs: number;
  meanRepairAttemptsPerRun: number;
  maxRepairAttemptsInARun: number;
}

/** `runId -> chapter` comes from `workflow_runs.target`, formatted "chapter-<n>" by `runChapterGeneration`. */
function chapterFromTarget(target: string | undefined): number | null {
  if (!target) return null;
  const match = /^chapter-(\d+)$/.exec(target);
  return match ? Number(match[1]) : null;
}

export function computeRepairStats(modelCalls: ModelCallRow[], runTargets: RunTargetRow[]): RepairStatsReport {
  const targetByRun = new Map(runTargets.map(r => [r.runId, r.target]));
  const byRun = new Map<string, { repairPatchCount: number; repairRewriteCount: number }>();

  for (const call of modelCalls) {
    if (!call.runId || !call.node || !REPAIR_NODES.has(call.node)) continue;
    const entry = byRun.get(call.runId) ?? { repairPatchCount: 0, repairRewriteCount: 0 };
    if (call.node === 'repairPatch') entry.repairPatchCount++;
    else entry.repairRewriteCount++;
    byRun.set(call.runId, entry);
  }

  const perRun: ChapterRepairStat[] = [...byRun.entries()].map(([runId, counts]) => ({
    chapter: chapterFromTarget(targetByRun.get(runId)),
    runId,
    repairPatchCount: counts.repairPatchCount,
    repairRewriteCount: counts.repairRewriteCount,
    totalRepairAttempts: counts.repairPatchCount + counts.repairRewriteCount,
  }));

  const totals = perRun.map(r => r.totalRepairAttempts);
  const totalRepairAttempts = totals.reduce((a, b) => a + b, 0);

  return {
    perRun,
    totalRepairAttempts,
    runsWithRepairs: perRun.length,
    meanRepairAttemptsPerRun: perRun.length === 0 ? 0 : totalRepairAttempts / perRun.length,
    maxRepairAttemptsInARun: totals.length === 0 ? 0 : Math.max(...totals),
  };
}

export interface JobProgressRow {
  kind: string;
  progress: unknown;
}

export interface BatchHaltReport {
  totalGenerateJobs: number;
  haltedBatches: number;
  haltedRate: number;
  totalSkippedChapters: number;
}

function isHaltedProgress(progress: unknown): progress is { phase: string; skipped?: unknown[] } {
  return !!progress && typeof progress === 'object' && (progress as { phase?: unknown }).phase === 'awaiting_review';
}

export function computeBatchHaltStats(jobs: JobProgressRow[]): BatchHaltReport {
  const generateJobs = jobs.filter(j => j.kind === 'generate');
  const halted = generateJobs.filter(j => isHaltedProgress(j.progress));
  const totalSkippedChapters = halted.reduce((sum, j) => {
    const progress = j.progress as { skipped?: unknown[] };
    return sum + (Array.isArray(progress.skipped) ? progress.skipped.length : 0);
  }, 0);

  return {
    totalGenerateJobs: generateJobs.length,
    haltedBatches: halted.length,
    haltedRate: generateJobs.length === 0 ? 0 : halted.length / generateJobs.length,
    totalSkippedChapters,
  };
}

export interface ValidationReportPayload {
  windowsRequested?: number;
  windowsSucceeded?: number;
  failedRanges?: unknown[];
}

export interface ValidationCoverageReport {
  reportsChecked: number;
  totalWindowsRequested: number;
  totalWindowsSucceeded: number;
  overallCoverageRate: number;
  reportsWithFullCoverage: number;
  reportsWithFailures: number;
}

export function computeValidationCoverage(reports: { payload: ValidationReportPayload }[]): ValidationCoverageReport {
  let totalWindowsRequested = 0;
  let totalWindowsSucceeded = 0;
  let reportsWithFullCoverage = 0;
  let reportsWithFailures = 0;

  for (const { payload } of reports) {
    const requested = payload.windowsRequested ?? 0;
    const succeeded = payload.windowsSucceeded ?? 0;
    totalWindowsRequested += requested;
    totalWindowsSucceeded += succeeded;
    if (requested > 0 && succeeded === requested) reportsWithFullCoverage++;
    if ((payload.failedRanges?.length ?? 0) > 0) reportsWithFailures++;
  }

  return {
    reportsChecked: reports.length,
    totalWindowsRequested,
    totalWindowsSucceeded,
    overallCoverageRate: totalWindowsRequested === 0 ? 0 : totalWindowsSucceeded / totalWindowsRequested,
    reportsWithFullCoverage,
    reportsWithFailures,
  };
}
