import { and, asc, desc, eq, gt, inArray, lt } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, type OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { briefMatchesPov, resolveThreadChapterNumbers, sanitizeMarkdown } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Chapter, type PrimaryDatabase, schema } from '@server/database';

import { CHAPTER_LIST_DEFAULT_LIMIT, type ListChaptersQuery, type UpdateChapterBody } from './chapter.dto';

export type ChapterListResult = OffsetPaginationResult<Chapter.Row> & { page: number; totalPages: number };

@Injectable()
export class ChapterService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async list(projectId: bigint, filter: ListChaptersQuery): Promise<ChapterListResult> {
    const query = utils.pagination.normalise(filter, {
      mode: 'offset',
      defaults: { limit: CHAPTER_LIST_DEFAULT_LIMIT, offset: 0, sortBy: 'number', sortOrder: 'desc' },
    });

    const numberFilter = filter.pov || filter.thread ? await this.resolveNumberFilter(projectId, filter) : null;
    if (numberFilter && numberFilter.size === 0) return this.emptyResult(query);

    const conditions = [eq(schema.chapters.projectId, projectId)];
    if (filter.status) conditions.push(eq(schema.chapters.status, filter.status));
    if (filter.volumeKey) conditions.push(eq(schema.chapters.volumeKey, filter.volumeKey));
    if (numberFilter) conditions.push(inArray(schema.chapters.number, [...numberFilter]));
    const where = and(...conditions);

    if (filter.goto !== undefined) {
      const listed = await this.db.$count(schema.chapters, and(where, eq(schema.chapters.number, filter.goto)));
      if (listed === 0) throw AppErrorCode.CHP_001.create();
      query.sortBy = 'number';
      const position = await this.db.$count(
        schema.chapters,
        and(where, query.sortOrder === 'desc' ? gt(schema.chapters.number, filter.goto) : lt(schema.chapters.number, filter.goto)),
      );
      query.offset = Math.floor(position / query.limit) * query.limit;
    }

    const column = query.sortBy === 'number' ? schema.chapters.number : query.sortBy === 'createdAt' ? schema.chapters.createdAt : schema.chapters.updatedAt;
    const order = query.sortOrder === 'asc' ? asc(column) : desc(column);

    const [total, items] = await Promise.all([
      this.db.$count(schema.chapters, where),
      this.db.query.chapters.findMany({ where, limit: query.limit, offset: query.offset, orderBy: order }),
    ]);

    return this.toResult(query, items, total);
  }

  private async resolveNumberFilter(projectId: bigint, filter: ListChaptersQuery): Promise<Set<number>> {
    const sets: Set<number>[] = [];
    if (filter.pov) sets.push(await this.chapterNumbersByPov(projectId, filter.pov));
    if (filter.thread) sets.push(await this.chapterNumbersByThread(projectId, filter.thread));
    const [first, ...rest] = sets;
    if (!first) return new Set();
    return rest.reduce((kept, next) => new Set([...kept].filter(number => next.has(number))), first);
  }

  private async chapterNumbersByPov(projectId: bigint, pov: string): Promise<Set<number>> {
    const briefs = await this.db.query.briefs.findMany({
      columns: { chapter: true, pov: true, scenes: true },
      where: eq(schema.briefs.projectId, projectId),
    });
    const matches = briefs.filter(brief => briefMatchesPov(brief, pov));
    return new Set(matches.map(brief => brief.chapter));
  }

  private chapterNumbersByThread(projectId: bigint, threadKey: string): Promise<Set<number>> {
    return resolveThreadChapterNumbers(this.db, projectId, threadKey);
  }

  private emptyResult(query: { limit: number; offset: number }): ChapterListResult {
    return { total: 0, limit: query.limit, offset: query.offset, items: [], page: Math.floor(query.offset / query.limit) + 1, totalPages: 0 };
  }

  private toResult(query: { limit: number; offset: number }, items: Chapter.Row[], total: number): ChapterListResult {
    return { total, limit: query.limit, offset: query.offset, items, page: Math.floor(query.offset / query.limit) + 1, totalPages: Math.ceil(total / query.limit) };
  }

  get(projectId: bigint, number: number): Promise<Chapter.Row | null> {
    return this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, number)) }).then(r => r ?? null);
  }

  async update(projectId: bigint, number: number, update: UpdateChapterBody): Promise<Chapter.Row> {
    const [result] = await this.db
      .update(schema.chapters)
      .set({
        ...(update.title !== undefined && { title: sanitizeMarkdown(update.title) }),
        ...(update.content !== undefined && { content: sanitizeMarkdown(update.content) }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, number), eq(schema.chapters.locked, false)))
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!result) return this.notFoundOrLocked(projectId, number);
    return result;
  }

  async delete(projectId: bigint, number: number): Promise<void> {
    const result = await this.db
      .delete(schema.chapters)
      .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, number), eq(schema.chapters.locked, false)))
      .returning();

    if (result.length === 0) await this.notFoundOrLocked(projectId, number);
  }

  // Finalized prose (`chapters.locked`) never changes except through amend — the chapter PATCH/DELETE
  // routes exist for pre-finalize manuscript editing, so a locked chapter here is a conflict, not a 404.
  private async notFoundOrLocked(projectId: bigint, number: number): Promise<never> {
    const existing = await this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, number)) });
    throw existing?.locked ? AppErrorCode.CHP_008.create() : AppErrorCode.CHP_001.create();
  }
}
