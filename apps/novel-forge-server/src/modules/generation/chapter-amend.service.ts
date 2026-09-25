import { and, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { applyAmendRepublish, declaredDraftFields, sanitizeMarkdown } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Chapter, type DbExecutor, type PrimaryDatabase, schema } from '@server/database';

import { IndexingService } from '../ai/retrieval/indexing.service';
import { renderChapterPayload } from '../publishing/publish-payload';
import { type AmendChapterBody, type AmendChapterResponse } from './generation.dto';

type AmendedDraftFields = Partial<Pick<Chapter.Row, 'title' | 'contentRating'>>;

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
   * Replaces a finalized chapter's prose in place — the one path allowed past `chapters.locked`.
   * It is deliberately prose-only: the bible keeps every fact this
   * chapter already contributed and no downstream chapter is flagged, so the response asks the UI to
   * offer `extract-to-bible` as the author's explicit follow-up.
   */
  async amend(projectId: bigint, chapterNumber: number, body: AmendChapterBody): Promise<AmendChapterResponse> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { id: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const where = and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapterNumber));
    const chapter = await this.db.query.chapters.findFirst({ where });
    if (!chapter) throw AppErrorCode.CHP_001.create();
    if (chapter.status !== 'done') throw AppErrorCode.CHP_006.create();

    const declared = declaredDraftFields({ contentRating: body.contentRating });

    const { amended, decision } = await this.db.transaction(async tx => {
      // No `setWhere: ne(locked, true)` here, unlike the finalization graph's `commitProse`: that guard
      // stops a re-run from clobbering canon it did not write, and clobbering canon on the author's
      // explicit instruction is this endpoint's entire purpose. `locked` stays true — amend never unlocks.
      const content = sanitizeMarkdown(body.content);
      const [amended] = await tx
        .update(schema.chapters)
        .set({
          content,
          wordCount: countWords(content),
          ...(body.title !== undefined && { title: sanitizeMarkdown(body.title) }),
          ...(body.note !== undefined && { note: sanitizeMarkdown(body.note) }),
          ...declared,
          locked: true,
          updatedAt: new Date(),
        })
        .where(where)
        .returning();
      if (!amended) throw AppErrorCode.CHP_001.create();

      const draftFields: AmendedDraftFields = {
        ...(body.title !== undefined && { title: amended.title }),
        ...(body.contentRating !== undefined && { contentRating: amended.contentRating }),
      };
      await this.syncFinalDraft(tx, projectId, chapterNumber, amended, draftFields);
      const decision = await applyAmendRepublish(tx, projectId, chapterNumber, renderChapterPayload(amended));
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
   * Every reader of a finalized chapter's prose that goes through its draft (the chapter reader and amend pre-fill, extract-to-bible, the manuscript, a resumed
   * finalize) must see the amendment, so the final draft takes it under a new revision. Unrestricted fill and legacy rows can leave the finalized body with no
   * history row, so it is snapshotted first; amendments filed before the draft followed them sit above its counter. Its judge verdict described the old prose, so it is cleared.
   */
  private async syncFinalDraft(tx: DbExecutor, projectId: bigint, chapterNumber: number, chapter: Chapter.Row, fields: AmendedDraftFields): Promise<void> {
    const draft = await tx.query.drafts.findFirst({
      where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapterNumber), eq(schema.drafts.status, 'final')),
      columns: { id: true, revision: true, body: true, summary: true, state: true, generator: true },
    });
    if (!draft) {
      this.logger.info('amend: no final draft to carry the amended prose, skipping the draft and its revision record', { projectId, chapter: chapterNumber });
      return;
    }

    const latest = await tx.query.draftRevisions.findFirst({
      where: eq(schema.draftRevisions.draftId, draft.id),
      orderBy: desc(schema.draftRevisions.revision),
      columns: { revision: true },
    });
    const revision = Math.max(draft.revision, latest?.revision ?? 0) + 1;
    const body = chapter.content ?? '';

    await tx
      .insert(schema.draftRevisions)
      .values({
        projectId,
        draftId: draft.id,
        revision: draft.revision,
        source: draft.generator === 'human' ? 'imported' : 'generated',
        body: draft.body,
        summary: draft.summary,
        state: draft.state,
      })
      .onConflictDoNothing();

    const [synced] = await tx
      .update(schema.drafts)
      .set({ body, words: chapter.wordCount, revision, ...fields, judge: null, judgeNote: null, updatedAt: new Date() })
      .where(and(eq(schema.drafts.id, draft.id), eq(schema.drafts.status, 'final'), eq(schema.drafts.revision, draft.revision)))
      .returning({ id: schema.drafts.id });
    if (!synced) throw AppErrorCode.DRF_013.create();

    await tx.insert(schema.draftRevisions).values({ projectId, draftId: draft.id, revision, source: 'amended', body, summary: chapter.summary, state: draft.state });
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
