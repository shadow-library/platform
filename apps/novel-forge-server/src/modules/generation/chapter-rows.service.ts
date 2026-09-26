import { and, asc, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import {
  buildChapterRows,
  chapterNumbersMatchingPov,
  type ChapterRow,
  type ChapterRowBrief,
  type ChapterRowDraft,
  firstUnwrittenChapter,
  isBlank,
  isFinalizable,
  pageChapterRows,
  resolveThreadChapterNumbers,
  summarizeChapterRows,
} from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

import { type ListChapterRowsQuery, type ListChapterRowsResponse } from './generation.dto';

const drafts = schema.drafts;

// Counted in Postgres so the list never ships prose; `\s` matches the web reader's own whitespace split.
const wordCount = sql<number>`coalesce(array_length(regexp_split_to_array(nullif(regexp_replace(${drafts.body}, '^\\s+|\\s+$', '', 'g'), ''), '\\s+'), 1), 0)`.mapWith(Number);

@Injectable()
export class ChapterRowsService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async list(projectId: bigint, query: ListChapterRowsQuery): Promise<ListChapterRowsResponse> {
    const { rows: allRows, briefRows, nextWritableChapter } = await this.loadRows(projectId);
    const rows = await this.narrowByPovAndThread(projectId, allRows, briefRows, query);
    const page = pageChapterRows(rows, query.filter, query.limit, query.offset);
    return { ...summarizeChapterRows(allRows), nextWritableChapter, ...page, limit: query.limit, offset: query.offset };
  }

  private async narrowByPovAndThread(projectId: bigint, rows: ChapterRow[], briefRows: readonly ChapterRowBrief[], query: ListChapterRowsQuery): Promise<ChapterRow[]> {
    if (!query.pov && !query.thread) return rows;
    const sets: Set<number>[] = [];
    if (query.pov) sets.push(chapterNumbersMatchingPov(briefRows, query.pov));
    if (query.thread) sets.push(await resolveThreadChapterNumbers(this.db, projectId, query.thread));
    const [first, ...rest] = sets;
    const kept = rest.reduce((kept, next) => new Set([...kept].filter(number => next.has(number))), first ?? new Set<number>());
    return rows.filter(row => kept.has(row.chapter));
  }

  private async loadRows(projectId: bigint): Promise<{ rows: ChapterRow[]; briefRows: ChapterRowBrief[]; nextWritableChapter: number }> {
    const [draftRows, briefRows, finalizedRows] = await Promise.all([
      this.db
        .select({
          chapter: drafts.chapter,
          title: drafts.title,
          status: drafts.status,
          reviewStatus: drafts.reviewStatus,
          generator: drafts.generator,
          isolated: drafts.isolated,
          summary: drafts.summary,
          state: drafts.state,
          judgeNote: drafts.judgeNote,
          revision: drafts.revision,
          approvedRevision: drafts.approvedRevision,
          wordCount,
        })
        .from(drafts)
        .where(eq(drafts.projectId, projectId))
        .orderBy(asc(drafts.chapter)),
      this.db.query.briefs.findMany({
        where: eq(schema.briefs.projectId, projectId),
        columns: { chapter: true, title: true, writeMode: true, pov: true, scenes: true },
        orderBy: asc(schema.briefs.chapter),
      }),
      this.db.query.chapters.findMany({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')), columns: { number: true } }),
    ]);

    const written: ChapterRowDraft[] = draftRows.map(({ summary, state, ...draft }) => ({
      ...draft,
      finalizeBlocked: !isFinalizable({ isolated: draft.isolated, summary, state }) || (!draft.isolated && isBlank(summary)),
    }));
    const nextWritableChapter = firstUnwrittenChapter(new Set(draftRows.map(draft => draft.chapter)), new Set(finalizedRows.map(chapter => chapter.number)));
    return { rows: buildChapterRows(written, briefRows), briefRows, nextWritableChapter };
  }
}
