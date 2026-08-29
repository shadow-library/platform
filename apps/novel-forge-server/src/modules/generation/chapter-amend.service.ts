import { and, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { assertActiveProject, decideAmendRepublish, declaredDraftFields } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Chapter, type DbExecutor, type PrimaryDatabase, schema } from '@server/database';

import { IndexingService } from '../ai/retrieval/indexing.service';
import { renderChapterPayload } from '../publishing/publish-payload';
import { type AmendChapterBody, type AmendChapterResponse } from './generation.dto';

function countWords(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

@Injectable()
export class ChapterAmendService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterAmendService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly indexingService: IndexingService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Replaces a finalized chapter's prose in place — the one path allowed past `chapters.locked`
   * (interstitial-chapter design §10). It is deliberately prose-only: the bible keeps every fact this
   * chapter already contributed and no downstream chapter is flagged, so the response asks the UI to
   * offer `extract-to-bible` as the author's explicit follow-up.
   */
  async amend(projectId: bigint, chapterNumber: number, body: AmendChapterBody): Promise<AmendChapterResponse> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { status: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertActiveProject(project);

    const where = and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapterNumber));
    const chapter = await this.db.query.chapters.findFirst({ where });
    if (!chapter) throw AppErrorCode.CHP_001.create();
    if (chapter.status !== 'done') throw AppErrorCode.CHP_006.create();

    const declared = declaredDraftFields({ contentRating: body.contentRating });

    const { amended, decision } = await this.db.transaction(async tx => {
      // No `setWhere: ne(locked, true)` here, unlike the finalization graph's `commitProse`: that guard
      // stops a re-run from clobbering canon it did not write, and clobbering canon on the author's
      // explicit instruction is this endpoint's entire purpose. `locked` stays true — amend never unlocks.
      const [amended] = await tx
        .update(schema.chapters)
        .set({
          content: body.content,
          wordCount: countWords(body.content),
          ...(body.title !== undefined && { title: body.title }),
          ...(body.note !== undefined && { note: body.note }),
          ...declared,
          locked: true,
          updatedAt: new Date(),
        })
        .where(where)
        .returning();
      if (!amended) throw AppErrorCode.CHP_001.create();

      await this.recordRevision(tx, projectId, chapterNumber, amended);
      const decision = await this.republish(tx, projectId, chapterNumber, amended);
      return { amended, decision };
    });

    const indexed = await this.reindex(projectId, chapterNumber, amended);
    this.logger.info('chapter amended', { projectId, chapter: chapterNumber, words: amended.wordCount, indexed, republish: decision });

    return {
      chapter: chapterNumber,
      wordCount: amended.wordCount ?? 0,
      indexed,
      republished: decision.republish,
      ...(decision.republish && { publicationRevision: decision.revision }),
      suggestExtractToBible: true,
    };
  }

  /**
   * `draft_revisions` keys on `draftId`, and a finalized chapter's draft is `final` (or, for an
   * imported novel, was never created) — so the history row attaches to that final draft without
   * mutating it, which keeps `DRF_002`'s "a final draft is immutable" invariant intact. The revision
   * number clears both the draft's own counter and the highest row already filed against it, so
   * repeated amendments stay distinct under the `(draft_id, revision)` unique key.
   */
  private async recordRevision(tx: DbExecutor, projectId: bigint, chapterNumber: number, chapter: Chapter.Row): Promise<void> {
    const draft = await tx.query.drafts.findFirst({
      where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapterNumber)),
      columns: { id: true, revision: true },
    });
    if (!draft) {
      this.logger.warn('amend: no draft row to key prose history to, skipping the revision record', { projectId, chapter: chapterNumber });
      return;
    }

    const latest = await tx.query.draftRevisions.findFirst({
      where: eq(schema.draftRevisions.draftId, draft.id),
      orderBy: desc(schema.draftRevisions.revision),
      columns: { revision: true },
    });

    await tx
      .insert(schema.draftRevisions)
      .values({
        projectId,
        draftId: draft.id,
        revision: Math.max(draft.revision, latest?.revision ?? 0) + 1,
        source: 'amended',
        body: chapter.content ?? '',
        summary: chapter.summary,
      })
      .onConflictDoNothing();
  }

  /** `publishedOrdinal` is absent from the set clause on purpose: it is the reader's URL, frozen the moment the chapter first published. */
  private async republish(tx: DbExecutor, projectId: bigint, chapterNumber: number, chapter: Chapter.Row) {
    const payload = renderChapterPayload(chapter);
    const ledger = await tx.query.chapterPublications.findFirst({
      where: and(eq(schema.chapterPublications.projectId, projectId), eq(schema.chapterPublications.chapter, chapterNumber)),
      orderBy: desc(schema.chapterPublications.publishedOrdinal),
    });

    const decision = decideAmendRepublish(ledger ?? null, payload.contentHash);
    if (!ledger || !decision.republish) return decision;

    await tx
      .update(schema.chapterPublications)
      .set({
        title: payload.title,
        authorNote: payload.authorNote ?? null,
        contentHash: payload.contentHash,
        revision: decision.revision,
        status: 'scheduled',
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.chapterPublications.id, ledger.id));

    return decision;
  }

  /**
   * Runs after the transaction commits, never inside it: `addProse` calls an embedding model, and a
   * network round-trip has no business holding a write lock over canon. The failure that buys is a
   * committed amendment with a stale index, so it is resolved in the safe direction — drop the chunks
   * and leave the chapter unindexed for `backfill` to pick up. Retrieval that returns nothing is
   * recoverable; retrieval that returns the sentence the author just deleted is the bug amend exists
   * to fix. `addProse` skips isolated chapters itself, so the flag reports that rather than gating it.
   */
  private async reindex(projectId: bigint, chapterNumber: number, chapter: Chapter.Row): Promise<boolean> {
    try {
      await this.indexingService.addProse(projectId, chapterNumber, chapter.content ?? '', chapter.isolated);
      return !chapter.isolated;
    } catch (err) {
      this.logger.error('amend: re-embed failed, leaving the chapter unindexed for the next backfill', { projectId, chapter: chapterNumber, err });
      await this.indexingService.deleteProse(projectId, chapterNumber).catch(cleanupErr => {
        this.logger.error('amend: could not drop the superseded chunks; the index still holds pre-amend prose', { projectId, chapter: chapterNumber, err: cleanupErr });
      });
      return false;
    }
  }
}
