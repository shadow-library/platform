import { sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, type OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { isolatedChapterNumbers } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';

import { CHAPTER_LIST_DEFAULT_LIMIT, type ChapterSearchHit, type SearchChaptersQuery } from './chapter.dto';

const SNIPPET_RADIUS = 60;

interface SearchRow {
  [key: string]: unknown;
  number: number;
  title: string | null;
  body: string;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

/** The excerpt around the first match and how many times it occurs, case-insensitively — shared so the count backing the SQL ranking and the count on the wire never diverge. */
export function buildSnippet(body: string, query: string): { snippet: string; matchCount: number } {
  const lowerBody = body.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.length === 0) return { snippet: body.slice(0, SNIPPET_RADIUS * 2).trim(), matchCount: 0 };

  let matchCount = 0;
  let firstIndex = -1;
  for (let at = lowerBody.indexOf(lowerQuery); at !== -1; at = lowerBody.indexOf(lowerQuery, at + lowerQuery.length)) {
    if (firstIndex === -1) firstIndex = at;
    matchCount += 1;
  }

  if (firstIndex === -1) return { snippet: body.slice(0, SNIPPET_RADIUS * 2).trim(), matchCount: 0 };

  const start = Math.max(0, firstIndex - SNIPPET_RADIUS);
  const end = Math.min(body.length, firstIndex + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return { snippet: `${prefix}${body.slice(start, end).trim()}${suffix}`, matchCount };
}

@Injectable()
export class ChapterSearchService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterSearchService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async search(projectId: bigint, filter: SearchChaptersQuery): Promise<OffsetPaginationResult<ChapterSearchHit> & { page: number; totalPages: number }> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: CHAPTER_LIST_DEFAULT_LIMIT, offset: 0, sortBy: 'number', sortOrder: 'desc' } });

    const q = filter.q.trim();
    if (!q) return this.emptyResult(query);

    const likePattern = `%${escapeLikePattern(q.toLowerCase())}%`;
    const volumeFilter = filter.volumeKey ? sql`AND prose.volume_key = ${filter.volumeKey}` : sql``;
    const povFilter = filter.pov
      ? sql`AND EXISTS (
          SELECT 1 FROM briefs b
          WHERE b.project_id = ${projectId} AND b.chapter = prose.number
            AND (b.pov = ${filter.pov} OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(b.scenes, '[]'::jsonb)) scene WHERE scene->>'pov' = ${filter.pov}))
        )`
      : sql``;
    const threadFilter = filter.thread
      ? sql`AND EXISTS (
          SELECT 1 FROM plot_threads pt
          WHERE pt.project_id = ${projectId} AND pt.thread_key = ${filter.thread}
            AND prose.number IN (pt.opened_chapter, pt.closed_chapter, pt.last_advanced_chapter)
        )`
      : sql``;

    const filtered = sql`
      FROM (
        SELECT
          COALESCE(c.number, d.chapter) AS number,
          COALESCE(d.title, c.title) AS title,
          COALESCE(d.volume_key, c.volume_key) AS volume_key,
          COALESCE(d.body, c.content) AS body
        FROM chapters c
        FULL OUTER JOIN drafts d ON d.project_id = c.project_id AND d.chapter = c.number
        WHERE COALESCE(c.project_id, d.project_id) = ${projectId}
      ) prose
      WHERE prose.body IS NOT NULL
        AND lower(prose.body) LIKE ${likePattern}
        AND prose.number NOT IN ${isolatedChapterNumbers(projectId)}
        ${volumeFilter}
        ${povFilter}
        ${threadFilter}
    `;

    const [totalRows, rows] = await Promise.all([
      this.db.execute<{ count: number }>(sql`SELECT count(*)::int AS count ${filtered}`),
      this.db.execute<SearchRow>(sql`
        SELECT prose.number, prose.title, prose.body
        ${filtered}
        ORDER BY (length(lower(prose.body)) - length(replace(lower(prose.body), ${q.toLowerCase()}, ''))) DESC, prose.number ASC
        LIMIT ${query.limit} OFFSET ${query.offset}
      `),
    ]);

    const total = totalRows[0]?.count ?? 0;
    const items: ChapterSearchHit[] = rows.map(row => ({ number: row.number, title: row.title, ...buildSnippet(row.body, q) }));

    this.logger.debug('search chapters', { projectId, q, hits: items.length, total });
    return this.toResult(query, items, total);
  }

  private emptyResult(query: { limit: number; offset: number }): OffsetPaginationResult<ChapterSearchHit> & { page: number; totalPages: number } {
    return { total: 0, limit: query.limit, offset: query.offset, items: [], page: Math.floor(query.offset / query.limit) + 1, totalPages: 0 };
  }

  private toResult(
    query: { limit: number; offset: number },
    items: ChapterSearchHit[],
    total: number,
  ): OffsetPaginationResult<ChapterSearchHit> & { page: number; totalPages: number } {
    return { total, limit: query.limit, offset: query.offset, items, page: Math.floor(query.offset / query.limit) + 1, totalPages: Math.ceil(total / query.limit) };
  }
}
