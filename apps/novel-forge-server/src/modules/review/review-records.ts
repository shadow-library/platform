import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type PrimaryTransaction, type Review, schema } from '@server/database';

import { graphJudgeOutcome, type GraphJudgePass, hashReviewedBody, isReviewStale, openFindings } from './review-findings';

export interface UsedModel {
  modelProvider: string | null;
  model: string | null;
  costTier: Review.ChapterReview['costTier'];
  contentMode: Review.ChapterReview['contentMode'];
}

export interface GenerationJudgeRecord {
  projectId: bigint;
  chapter: number;
  draftId: bigint;
  runId: string;
  body: string;
  pass: GraphJudgePass;
}

export const APPROVAL_OVERRIDE_REASON = 'approved by the author';

const logger = Logger.getLogger(APP_NAME, 'review-records');

type ReviewReader = Pick<PrimaryDatabase, 'query'>;

/** The model the run actually called, from its telemetry, rather than the route re-resolved after the fact. */
export async function usedModel(db: ReviewReader, runId: string, roles: string[]): Promise<UsedModel | null> {
  const call = await db.query.modelCalls.findFirst({
    where: and(eq(schema.modelCalls.runId, runId), inArray(schema.modelCalls.role, roles)),
    orderBy: desc(schema.modelCalls.createdAt),
    columns: { provider: true, model: true, tier: true, contentMode: true },
  });
  return call ? { modelProvider: call.provider, model: call.model, costTier: call.tier, contentMode: call.contentMode } : null;
}

/**
 * Stores the generation run's last judge pass as the review of the revision it accepted or held. Only the terminal pass is stored: a pass the
 * repair ladder replaced judged prose that no longer exists. A replayed run finds its own record and stores nothing twice.
 */
export async function recordGenerationJudge(db: PrimaryDatabase, record: GenerationJudgeRecord): Promise<void> {
  const draft = await db.query.drafts.findFirst({ where: eq(schema.drafts.id, record.draftId), columns: { revision: true, body: true, isolated: true } });
  if (!draft || draft.body !== record.body) return;
  const existing = await db.query.chapterReviews.findFirst({
    where: and(eq(schema.chapterReviews.runId, record.runId), eq(schema.chapterReviews.kind, 'judge'), eq(schema.chapterReviews.draftRevision, draft.revision)),
    columns: { id: true },
  });
  if (existing) return;

  const model = await usedModel(db, record.runId, ['judge']);
  await db.insert(schema.chapterReviews).values({
    projectId: record.projectId,
    chapter: record.chapter,
    draftRevision: draft.revision,
    bodyHash: hashReviewedBody(record.body),
    isolated: draft.isolated || model?.contentMode === 'unrestricted',
    kind: 'judge',
    ...graphJudgeOutcome(record.body, record.pass),
    runId: record.runId,
    costTier: model?.costTier ?? null,
    contentMode: model?.contentMode ?? null,
    modelProvider: model?.modelProvider ?? null,
    model: model?.model ?? null,
  });
  logger.debug('generation judge pass recorded', { projectId: record.projectId, chapter: record.chapter, revision: draft.revision, runId: record.runId });
}

/**
 * Approving is the author's answer to every blocking finding still open on the latest judge review of the text they approve, so each is
 * recorded as overridden. Returns how many were.
 */
export async function overrideOpenBlockingOnApproval(tx: PrimaryTransaction, draft: { projectId: bigint; chapter: number; revision: number; body: string }): Promise<number> {
  const latest = await tx.query.chapterReviews.findFirst({
    where: and(eq(schema.chapterReviews.projectId, draft.projectId), eq(schema.chapterReviews.chapter, draft.chapter), eq(schema.chapterReviews.kind, 'judge')),
    orderBy: [desc(schema.chapterReviews.createdAt), desc(schema.chapterReviews.id)],
    with: { remedies: true },
  });
  if (!latest || isReviewStale(latest, { draftRevision: draft.revision, bodyHash: hashReviewedBody(draft.body) })) return 0;
  const open = openFindings(latest.findings, latest.remedies).filter(finding => finding.severity === 'blocking');
  if (open.length === 0) return 0;
  await tx
    .insert(schema.chapterReviewRemedies)
    .values(
      open.map(finding => ({ reviewId: latest.id, findingId: finding.id, fingerprint: finding.fingerprint, action: 'overridden' as const, reason: APPROVAL_OVERRIDE_REASON })),
    )
    .onConflictDoUpdate({
      target: [schema.chapterReviewRemedies.reviewId, schema.chapterReviewRemedies.findingId],
      set: { action: sql`excluded.action`, reason: sql`excluded.reason`, updatedAt: new Date() },
    });
  return open.length;
}
