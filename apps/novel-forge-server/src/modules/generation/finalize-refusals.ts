import { and, desc, eq, lt } from 'drizzle-orm';
import { type AppError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { isFinalizable, planRevealsRefusal } from '@server/common';
import { type Generation, type PrimaryDatabase, schema } from '@server/database';

import { openBlockingFindings } from '../review/review-records';

/** Every reason finalize refuses this draft, in its order: finalize throws the first, readiness lists them all; a half-finalized draft resumes. */
export async function finalizeRefusals(db: PrimaryDatabase, draft: Generation.Draft): Promise<AppError[]> {
  if (draft.status === 'final' && (await isChapterFinalized(db, draft))) return [AppErrorCode.DRF_002.create()];

  const [openBlocking, revealsRefusal, previousFinal, needsRevalidation, latestReport] = await Promise.all([
    draft.status === 'final' ? null : openBlockingFindings(db, draft),
    planRevealsRefusal(db, draft.projectId, draft.chapter),
    draft.chapter > 1
      ? db.query.drafts.findFirst({
          where: and(eq(schema.drafts.projectId, draft.projectId), eq(schema.drafts.chapter, draft.chapter - 1), eq(schema.drafts.status, 'final')),
          columns: { id: true },
        })
      : true,
    db.query.chapters.findFirst({
      where: and(eq(schema.chapters.projectId, draft.projectId), eq(schema.chapters.needsRevalidation, true), lt(schema.chapters.number, draft.chapter)),
      columns: { id: true },
    }),
    db.query.validationReports.findFirst({
      where: and(eq(schema.validationReports.projectId, draft.projectId), eq(schema.validationReports.scope, 'novel')),
      orderBy: desc(schema.validationReports.createdAt),
    }),
  ]);
  const reportIssues = (latestReport?.payload as { issues?: { chapter?: number; severity?: string }[] } | undefined)?.issues ?? [];

  const refusals: (AppError | null)[] = [
    draft.status !== 'final' && draft.reviewStatus !== 'approved' ? AppErrorCode.DRF_004.create() : null,
    draft.status !== 'final' && draft.staleReason !== null ? AppErrorCode.DRF_007.create() : null,
    openBlocking ? AppErrorCode.FIN_004.create({ chapter: String(draft.chapter) }) : null,
    isFinalizable(draft) ? null : AppErrorCode.CHP_005.create(),
    revealsRefusal,
    previousFinal ? null : AppErrorCode.FIN_001.create(),
    needsRevalidation ? AppErrorCode.FIN_002.create() : null,
    reportIssues.some(issue => issue.severity === 'error' && issue.chapter === draft.chapter) ? AppErrorCode.FIN_003.create() : null,
  ];
  return refusals.filter((refusal): refusal is AppError => refusal !== null);
}

/**
 * Whether chapter N reached the *end* of the finalization pipeline, as opposed to only its first (prose-committing) node. `commitProse` flips
 * the draft to `final` before continuity extraction and the cursor advance run, so a draft's own status cannot answer this — a failure anywhere
 * downstream leaves a `final` draft over a half-finalized chapter that must be allowed to finish.
 */
async function isChapterFinalized(db: PrimaryDatabase, draft: Generation.Draft): Promise<boolean> {
  const [chapterRow, project] = await Promise.all([
    db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, draft.projectId), eq(schema.chapters.number, draft.chapter)) }),
    db.query.projects.findFirst({ where: eq(schema.projects.id, draft.projectId) }),
  ]);
  if (!chapterRow) return false;
  // Isolated chapters bypass continuity extraction entirely, so their flag never turns true.
  if (!chapterRow.continuityApplied && !draft.isolated) return false;
  return (project?.storyCurrentChapter ?? 0) >= draft.chapter;
}
