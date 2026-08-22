import { and, asc, eq, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

export const DEFAULT_EXTRACT_LIMIT = 5;

@Injectable()
export class ExtractionService {
  private readonly logger = Logger.getLogger(APP_NAME, ExtractionService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Finalized chapters (`status = 'done'`) that have never had knowledge extraction run — no chapter
   * summary was ever written by the extraction pass. Ordered by chapter number ascending, capped at
   * `limit`, for use as an enqueue-time backfill target list.
   */
  async resolvePendingChapters(projectId: bigint, limit: number): Promise<number[]> {
    const chapters = await this.db.query.chapters.findMany({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done'), isNull(schema.chapters.summary)),
      columns: { number: true },
      orderBy: [asc(schema.chapters.number)],
      limit,
    });
    return chapters.map(ch => ch.number);
  }
}
