import { asc, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { buildChapterRows, type ChapterRow, type ChapterRowDraft, isFinalizable, pageChapterRows, summarizeChapterRows } from '@server/common';
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
    const rows = await this.loadRows(projectId);
    const page = pageChapterRows(rows, query.filter, query.limit, query.offset);
    return { ...summarizeChapterRows(rows), ...page, limit: query.limit, offset: query.offset };
  }

  private async loadRows(projectId: bigint): Promise<ChapterRow[]> {
    const [draftRows, briefRows] = await Promise.all([
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
          wordCount,
        })
        .from(drafts)
        .where(eq(drafts.projectId, projectId))
        .orderBy(asc(drafts.chapter)),
      this.db.query.briefs.findMany({
        where: eq(schema.briefs.projectId, projectId),
        columns: { chapter: true, title: true, writeMode: true },
        orderBy: asc(schema.briefs.chapter),
      }),
    ]);

    const written: ChapterRowDraft[] = draftRows.map(({ summary, state, ...draft }) => ({
      ...draft,
      finalizeBlocked: !isFinalizable({ isolated: draft.isolated, summary, state }),
    }));
    return buildChapterRows(written, briefRows);
  }
}
