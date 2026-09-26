import { z } from 'zod';

import { type ChapterReviewCompliance, type ChapterReviewFinding, type Review } from '@server/database';

import { findCurrentIsolation, findReviewedText, KIND_ORDER } from '../../../review/review-records';
import { isReviewStale, type ReviewedText } from '../../../review/review-findings';
import { isReviewRedacted, standardReadableReview } from '../../isolation-read-policy';
import { type RegisteredTool } from '../types';

type ReviewKindArg = (typeof KIND_ORDER)[number];

const inputSchema = z.object({
  chapter: z.number().int().min(1),
  kind: z.enum(KIND_ORDER).optional(),
});

const outputSchema = z.string();

type ReviewWithRemedies = Review.ChapterReview & { remedies: Review.Remedy[] };

function findingLine(finding: ChapterReviewFinding, remedy: Review.Remedy | undefined): string {
  const evidence = finding.evidence ? ` — evidence: "${finding.evidence}"` : '';
  const answered = remedy ? ` (remedy: ${remedy.action}${remedy.reason ? ` — ${remedy.reason}` : ''})` : '';
  return `- [${finding.severity}] ${finding.text}${evidence}${answered}`;
}

function complianceLine(label: string, compliance: ChapterReviewCompliance | null | undefined, redacted: boolean): string | null {
  if (!compliance) return null;
  if (compliance.compliant) return `${label}: compliant`;
  return redacted ? `${label}: not compliant — issues walled off` : `${label}: not compliant — ${compliance.issues.join('; ') || 'no issues recorded'}`;
}

function revisionLine(review: ReviewedText, current: ReviewedText | null): string {
  const reviewed = review.draftRevision !== null ? `revision ${review.draftRevision}` : 'the finalized text';
  if (!current) return `${reviewed} (the chapter no longer has a reviewable text)`;
  if (!isReviewStale(review, current)) return `${reviewed} (current)`;
  const currentLabel = current.draftRevision !== null ? `revision ${current.draftRevision}` : 'the finalized text';
  return `${reviewed} — stale, the chapter is now at ${currentLabel}`;
}

function renderReview(review: ReviewWithRemedies, current: ReviewedText | null, currentlyIsolated: boolean): string {
  const redacted = isReviewRedacted(review, currentlyIsolated);
  const readable = standardReadableReview(review, currentlyIsolated);
  const remedyByFinding = new Map(readable.remedies.map(remedy => [remedy.findingId, remedy]));
  const lines = [`**${review.kind} review** — ${review.disposition}${review.verdict ? ` (${review.verdict})` : ''}, reviewed ${revisionLine(review, current)}`];
  if (readable.note) lines.push(readable.note);
  lines.push(readable.findings.length > 0 ? readable.findings.map(finding => findingLine(finding, remedyByFinding.get(finding.id))).join('\n') : 'No findings.');
  if (review.checked.length > 0) lines.push(`Checked: ${review.checked.join(', ')}`);
  const compliance = [
    complianceLine('Brief compliance', readable.briefCompliance, redacted),
    complianceLine('Readability compliance', readable.readabilityCompliance, redacted),
    complianceLine('Ending compliance', readable.endingCompliance, redacted),
    complianceLine('Knowledge compliance', readable.knowledgeCompliance, redacted),
  ].filter((line): line is string => line !== null);
  lines.push(...compliance);
  return lines.join('\n');
}

export const getReviewTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description:
    "Retrieve the latest review(s) for a chapter: disposition, findings with severity, evidence and the author's remedy, what was checked, and whether the review is stale against the chapter's current revision. Use before critiquing a chapter the author wrote.",
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const kinds: readonly ReviewKindArg[] = parsed.kind ? [parsed.kind] : KIND_ORDER;

    const [found, current, currentlyIsolated] = await Promise.all([
      Promise.all(
        kinds.map(kind =>
          ctx.db.query.chapterReviews.findFirst({
            where: (review, { and, eq }) => and(eq(review.projectId, ctx.projectId), eq(review.chapter, parsed.chapter), eq(review.kind, kind)),
            orderBy: (review, { desc }) => [desc(review.createdAt), desc(review.id)],
            with: { remedies: true },
          }),
        ),
      ),
      findReviewedText(ctx.db, ctx.projectId, parsed.chapter),
      findCurrentIsolation(ctx.db, ctx.projectId, parsed.chapter),
    ]);

    const rows = found.filter((row): row is ReviewWithRemedies => row !== undefined);
    if (rows.length === 0) return `No ${parsed.kind ? `${parsed.kind} ` : ''}review recorded for chapter ${parsed.chapter}.`;

    const byKind = new Map(rows.map(row => [row.kind, row]));
    const blocks = KIND_ORDER.flatMap(kind => {
      const row = byKind.get(kind);
      return row ? [renderReview(row, current, currentlyIsolated)] : [];
    });
    return blocks.join('\n\n');
  },
  inputSchema,
  maxCallsPerRun: 4,
  name: 'get_review',
  outputSchema,
  tokensBudget: 5000,
};
