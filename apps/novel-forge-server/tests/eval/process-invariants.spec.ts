import { describe, expect, it } from 'bun:test';

import { checkFailOpenInvariant, computeBatchHaltStats, computeEvaluationFailedRate, computeRepairStats, computeValidationCoverage } from '@modules/eval/process-invariants';

describe('checkFailOpenInvariant', () => {
  it('should hold when no evaluation_failed draft exists', () => {
    const report = checkFailOpenInvariant([{ chapter: 1, judge: 'consistent', reviewStatus: 'approved', status: 'final' }], []);
    expect(report.holds).toBe(true);
    expect(report.evaluationFailedCount).toBe(0);
  });

  it('should hold when an evaluation_failed draft sits in contradiction/needs_review, unapproved', () => {
    const report = checkFailOpenInvariant([{ chapter: 1, judge: 'evaluation_failed', reviewStatus: 'contradiction', status: 'draft' }], []);
    expect(report.holds).toBe(true);
  });

  it('should hold when an evaluation_failed draft was approved through a recorded human approval', () => {
    const report = checkFailOpenInvariant([{ chapter: 1, judge: 'evaluation_failed', reviewStatus: 'approved', status: 'draft' }], [{ chapter: 1 }]);
    expect(report.holds).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it('should flag a violation when an evaluation_failed draft reached approved/final with no approval on record', () => {
    const report = checkFailOpenInvariant([{ chapter: 1, judge: 'evaluation_failed', reviewStatus: 'approved', status: 'draft' }], []);
    expect(report.holds).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.chapter).toBe(1);
  });

  it('should handle an empty draft list', () => {
    const report = checkFailOpenInvariant([], []);
    expect(report).toMatchObject({ totalDrafts: 0, evaluationFailedCount: 0, violations: [], holds: true });
  });
});

describe('computeEvaluationFailedRate', () => {
  it('should compute the share of evaluation_failed drafts', () => {
    const rate = computeEvaluationFailedRate([{ judge: 'consistent' }, { judge: 'evaluation_failed' }, { judge: 'contradiction' }, { judge: 'evaluation_failed' }]);
    expect(rate).toEqual({ total: 4, evaluationFailedCount: 2, rate: 0.5 });
  });

  it('should return a rate of 0 for an empty list', () => {
    expect(computeEvaluationFailedRate([])).toEqual({ total: 0, evaluationFailedCount: 0, rate: 0 });
  });
});

describe('computeRepairStats', () => {
  it('should group repair-node model calls by run and resolve the chapter from the run target', () => {
    const modelCalls = [
      { runId: 'run-1', node: 'repairPatch' },
      { runId: 'run-1', node: 'repairPatch' },
      { runId: 'run-1', node: 'repairRewrite' },
      { runId: 'run-1', node: 'draftChapter' },
      { runId: 'run-2', node: 'judge' },
    ];
    const runTargets = [
      { runId: 'run-1', target: 'chapter-7' },
      { runId: 'run-2', target: 'chapter-8' },
    ];
    const stats = computeRepairStats(modelCalls, runTargets);
    expect(stats.runsWithRepairs).toBe(1);
    expect(stats.totalRepairAttempts).toBe(3);
    expect(stats.perRun[0]).toMatchObject({ chapter: 7, repairPatchCount: 2, repairRewriteCount: 1, totalRepairAttempts: 3 });
    expect(stats.maxRepairAttemptsInARun).toBe(3);
  });

  it('should report zero stats when no repair-node calls exist', () => {
    const stats = computeRepairStats([{ runId: 'run-1', node: 'judge' }], [{ runId: 'run-1', target: 'chapter-1' }]);
    expect(stats).toMatchObject({ runsWithRepairs: 0, totalRepairAttempts: 0, meanRepairAttemptsPerRun: 0, maxRepairAttemptsInARun: 0 });
  });

  it('should tolerate calls with no runId or an unmapped run target', () => {
    const stats = computeRepairStats(
      [
        { runId: null, node: 'repairPatch' },
        { runId: 'run-x', node: 'repairPatch' },
      ],
      [],
    );
    expect(stats.perRun[0]).toMatchObject({ chapter: null, repairPatchCount: 1 });
  });
});

describe('computeBatchHaltStats', () => {
  it('should count generate jobs halted at awaiting_review with their skipped chapters', () => {
    const jobs = [
      { kind: 'generate', progress: { phase: 'awaiting_review', skipped: [3, 4, 5] } },
      { kind: 'generate', progress: { phase: 'generating' } },
      { kind: 'extract', progress: { phase: 'awaiting_review', skipped: [1] } },
    ];
    const stats = computeBatchHaltStats(jobs);
    expect(stats).toMatchObject({ totalGenerateJobs: 2, haltedBatches: 1, totalSkippedChapters: 3 });
    expect(stats.haltedRate).toBe(0.5);
  });

  it('should handle no generate jobs at all', () => {
    expect(computeBatchHaltStats([{ kind: 'publish', progress: null }])).toMatchObject({ totalGenerateJobs: 0, haltedBatches: 0, haltedRate: 0, totalSkippedChapters: 0 });
  });

  it('should treat null/malformed progress as not halted', () => {
    const stats = computeBatchHaltStats([
      { kind: 'generate', progress: null },
      { kind: 'generate', progress: 'not-an-object' },
    ]);
    expect(stats.haltedBatches).toBe(0);
  });
});

describe('computeValidationCoverage', () => {
  it('should aggregate windows requested/succeeded and flag reports with failures', () => {
    const reports = [
      { payload: { windowsRequested: 4, windowsSucceeded: 4, failedRanges: [] } },
      { payload: { windowsRequested: 4, windowsSucceeded: 2, failedRanges: [{ from: 10, to: 15 }] } },
    ];
    const coverage = computeValidationCoverage(reports);
    expect(coverage).toMatchObject({ reportsChecked: 2, totalWindowsRequested: 8, totalWindowsSucceeded: 6, reportsWithFullCoverage: 1, reportsWithFailures: 1 });
    expect(coverage.overallCoverageRate).toBeCloseTo(0.75);
  });

  it('should handle an empty report list', () => {
    expect(computeValidationCoverage([])).toMatchObject({ reportsChecked: 0, totalWindowsRequested: 0, totalWindowsSucceeded: 0, overallCoverageRate: 0 });
  });

  it('should treat missing payload fields as zero/empty', () => {
    const coverage = computeValidationCoverage([{ payload: {} }]);
    expect(coverage).toMatchObject({ reportsChecked: 1, totalWindowsRequested: 0, totalWindowsSucceeded: 0, reportsWithFullCoverage: 0, reportsWithFailures: 0 });
  });
});
