// Track 3 (harness-final-recommendation.md §14) process/telemetry invariant checks — standalone runnable
// CLI. Reusable tooling: intended to run later against a real project's data, not as a one-off. All
// invariant math lives in `@server/modules/eval/process-invariants` (pure, unit-tested); this script only
// does argument parsing, DB fetch, and report printing.
//
// Usage:
//   bun run eval:invariants -- --project <id> [--from <n> --to <n>] [--since <ISO date>] [--json]
//
//   --project   project id (required)
//   --from/--to inclusive chapter-number range for the draft-level checks (fail-open, evaluation_failed
//               rate); omit for the whole project
//   --since     ISO date — restricts model_calls/jobs/validation_reports to rows created on/after it,
//               approximating a "run" window since none of those tables carry a run/batch id of their own
//   --json      print the full machine-readable report instead of the plain-text summary
//
// Connects to `DATABASE_POSTGRES_URL` directly (same convention as `src/migrate.ts`) — an infra script
// that runs outside the app, exempt from the "read config via Config" rule.
import { and, eq, gte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import * as schema from '@server/database/schemas';
import {
  type BatchHaltReport,
  checkFailOpenInvariant,
  computeBatchHaltStats,
  computeEvaluationFailedRate,
  computeRepairStats,
  computeValidationCoverage,
  type EvaluationFailedRateReport,
  type FailOpenInvariantReport,
  type RepairStatsReport,
  type ValidationCoverageReport,
} from '@server/modules/eval/process-invariants';

interface ProcessInvariantsReport {
  failOpen: FailOpenInvariantReport;
  evaluationFailedRate: EvaluationFailedRateReport;
  repairStats: RepairStatsReport;
  batchHalts: BatchHaltReport;
  validationCoverage: ValidationCoverageReport;
}

interface Args {
  projectId: bigint;
  from: number | null;
  to: number | null;
  since: Date | null;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      flags.set('json', 'true');
      continue;
    }
    if (arg?.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`missing value for --${key}`);
      flags.set(key, value);
      i++;
    }
  }

  const projectIdRaw = flags.get('project');
  if (!projectIdRaw) throw new Error('--project <id> is required');

  return {
    projectId: BigInt(projectIdRaw),
    from: flags.has('from') ? Number(flags.get('from')) : null,
    to: flags.has('to') ? Number(flags.get('to')) : null,
    since: flags.has('since') ? new Date(flags.get('since')!) : null,
    json: flags.has('json'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
  const db = drizzle(url, { schema });

  const draftRows = await db.query.drafts.findMany({
    where: (t, { and: andOp, gte: gteOp, lte: lteOp }) =>
      andOp(eq(t.projectId, args.projectId), args.from !== null ? gteOp(t.chapter, args.from) : undefined, args.to !== null ? lteOp(t.chapter, args.to) : undefined),
    columns: { chapter: true, judge: true, reviewStatus: true, status: true },
  });

  const approvalRows = await db.query.userFeedback.findMany({
    where: and(eq(schema.userFeedback.projectId, args.projectId), eq(schema.userFeedback.artifactType, 'draft'), eq(schema.userFeedback.disposition, 'approved')),
    columns: { artifactRef: true },
  });
  const approvals = approvalRows.map(r => ({ chapter: Number(r.artifactRef) })).filter(r => Number.isFinite(r.chapter));

  const failOpen = checkFailOpenInvariant(draftRows, approvals);
  const evaluationFailedRate = computeEvaluationFailedRate(draftRows);

  const modelCallWhere = args.since
    ? and(eq(schema.modelCalls.projectId, args.projectId), gte(schema.modelCalls.createdAt, args.since))
    : eq(schema.modelCalls.projectId, args.projectId);
  const modelCallRows = await db.query.modelCalls.findMany({ where: modelCallWhere, columns: { runId: true, node: true } });

  const runRows = await db.query.workflowRuns.findMany({
    where: and(eq(schema.workflowRuns.projectId, args.projectId), eq(schema.workflowRuns.graph, 'chapter-generation')),
    columns: { id: true, target: true },
  });
  const runTargets = runRows.map(r => ({ runId: r.id, target: r.target }));
  const repairStats = computeRepairStats(modelCallRows, runTargets);

  const jobWhere = args.since ? and(eq(schema.jobs.projectId, args.projectId), gte(schema.jobs.createdAt, args.since)) : eq(schema.jobs.projectId, args.projectId);
  const jobRows = await db.query.jobs.findMany({ where: jobWhere, columns: { kind: true, progress: true } });
  const batchHalts = computeBatchHaltStats(jobRows);

  const validationWhere = args.since
    ? and(eq(schema.validationReports.projectId, args.projectId), gte(schema.validationReports.createdAt, args.since))
    : eq(schema.validationReports.projectId, args.projectId);
  const validationRows = await db.query.validationReports.findMany({ where: validationWhere, columns: { payload: true } });
  const validationCoverage = computeValidationCoverage(validationRows as { payload: { windowsRequested?: number; windowsSucceeded?: number; failedRanges?: unknown[] } }[]);

  const report: ProcessInvariantsReport = { failOpen, evaluationFailedRate, repairStats, batchHalts, validationCoverage };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(args, report);
  }

  await db.$client.close();
}

function printTextReport(args: Args, report: ProcessInvariantsReport): void {
  console.log(`Track 3 — process/telemetry invariants — project ${args.projectId}`);
  console.log('');

  console.log('Fail-open judge acceptances (must be 0 by construction — see module doc comment for what "impossible by construction" means here):');
  console.log(`  evaluation_failed drafts: ${report.failOpen.evaluationFailedCount}/${report.failOpen.totalDrafts}`);
  console.log(`  violations: ${report.failOpen.violations.length} (${report.failOpen.holds ? 'INVARIANT HOLDS' : 'INVARIANT VIOLATED'})`);
  for (const v of report.failOpen.violations) console.log(`    chapter ${v.chapter}: ${v.reason} (reviewStatus=${v.reviewStatus}, status=${v.status})`);
  console.log('');

  console.log(
    `evaluation_failed rate: ${report.evaluationFailedRate.evaluationFailedCount}/${report.evaluationFailedRate.total} (${(report.evaluationFailedRate.rate * 100).toFixed(1)}%)`,
  );
  console.log('');

  console.log('Repair attempts / patch-cycle counts (from model_calls, grouped by run):');
  console.log(`  runs with repairs: ${report.repairStats.runsWithRepairs}, total repair attempts: ${report.repairStats.totalRepairAttempts}`);
  console.log(`  mean/run: ${report.repairStats.meanRepairAttemptsPerRun.toFixed(2)}, max/run: ${report.repairStats.maxRepairAttemptsInARun}`);
  for (const r of report.repairStats.perRun) console.log(`    chapter ${r.chapter ?? '(unknown)'} (run ${r.runId}): patch=${r.repairPatchCount} rewrite=${r.repairRewriteCount}`);
  console.log('');

  console.log('Batch halts on findings:');
  console.log(`  generate jobs: ${report.batchHalts.totalGenerateJobs}, halted: ${report.batchHalts.haltedBatches} (${(report.batchHalts.haltedRate * 100).toFixed(1)}%)`);
  console.log(`  total chapters skipped by halts: ${report.batchHalts.totalSkippedChapters}`);
  console.log('');

  console.log('Validation coverage reported:');
  console.log(`  reports checked: ${report.validationCoverage.reportsChecked}`);
  console.log(
    `  windows requested/succeeded: ${report.validationCoverage.totalWindowsRequested}/${report.validationCoverage.totalWindowsSucceeded} (${(report.validationCoverage.overallCoverageRate * 100).toFixed(1)}%)`,
  );
  console.log(`  reports with full coverage: ${report.validationCoverage.reportsWithFullCoverage}, reports with failed windows: ${report.validationCoverage.reportsWithFailures}`);
  console.log('');

  console.log('Stale/briefless generations rejected (must be 100%):');
  console.log('  NOT measurable from stored data — a rejected generate() call throws BRF_001/BRF_002 and');
  console.log("  persists nothing recording the rejection. Verified instead by tests/bible/arc.spec.ts's");
  console.log('  existing BRF_001/BRF_002 tests (P0-04). This script deliberately does not claim coverage here.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
