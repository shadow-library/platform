import { eq } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { type BibleAuditFinding, type DbExecutor, type Job, schema } from '@server/database';

/** The ops an audit card may apply: every op some finding the author has not skipped still proposes. */
export function selectedOpIndexes(findings: readonly BibleAuditFinding[], decisions: readonly Pick<Job.FindingDecision, 'findingId' | 'decision'>[]): number[] {
  const skipped = new Set(decisions.filter(decision => decision.decision === 'skipped').map(decision => decision.findingId));
  return [...new Set(findings.filter(finding => !skipped.has(finding.id)).flatMap(finding => finding.opIndexes))].sort((a, b) => a - b);
}

export async function findAuditReportForCard(db: DbExecutor, proposalId: bigint): Promise<(Job.ValidationReport & { decisions: Job.FindingDecision[] }) | undefined> {
  return db.query.validationReports.findFirst({ where: eq(schema.validationReports.proposalId, proposalId), with: { decisions: true } });
}

/**
 * What an apply of an audit card may take: the author's Keep and Skip answers, read after the card row is locked so an answer committed
 * first is seen. No selection applies what was kept; a selection must stay within it. Undefined for a card no report stands behind.
 */
export async function auditCardSelection(db: DbExecutor, proposalId: bigint, requested: readonly number[] | undefined): Promise<number[] | undefined> {
  const report = await findAuditReportForCard(db, proposalId);
  if (!report) return undefined;
  const kept = selectedOpIndexes(report.findings ?? [], report.decisions);
  if (kept.length === 0) throw AppErrorCode.AUD_005.create();
  if (!requested) return kept;
  const allowed = new Set(kept);
  if (!requested.every(index => allowed.has(index))) throw AppErrorCode.AUD_006.create();
  return [...requested];
}
