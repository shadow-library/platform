/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, desc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Chapter, type PrimaryDatabase, schema } from '@server/database';

import { type ListChaptersQuery, type UpdateChapterBody } from './chapter.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class ChapterService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async list(projectId: bigint, filter: ListChaptersQuery): Promise<OffsetPaginationResult<Chapter.Row>> {
    const query = utils.pagination.normalise(filter, {
      mode: 'offset',
      defaults: { limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'asc' },
    });

    const where = filter.status ? and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, filter.status)) : eq(schema.chapters.projectId, projectId);

    const column = query.sortBy === 'createdAt' ? schema.chapters.createdAt : schema.chapters.updatedAt;
    const order = query.sortOrder === 'asc' ? asc(column) : desc(column);

    const [total, items] = await Promise.all([
      this.db.$count(schema.chapters, where),
      this.db.query.chapters.findMany({ where, limit: query.limit, offset: query.offset, orderBy: order }),
    ]);

    return utils.pagination.createResult(query, items, total);
  }

  get(projectId: bigint, number: number): Promise<Chapter.Row | null> {
    return this.db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, number)) }).then(r => r ?? null);
  }

  async update(projectId: bigint, number: number, update: UpdateChapterBody): Promise<Chapter.Row> {
    const [result] = await this.db
      .update(schema.chapters)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, number)))
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!result) throw new ServerError(AppErrorCode.CHP_001);
    return result;
  }

  async delete(projectId: bigint, number: number): Promise<void> {
    const result = await this.db
      .delete(schema.chapters)
      .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, number)))
      .returning();

    if (result.length === 0) throw new ServerError(AppErrorCode.CHP_001);
  }
}
