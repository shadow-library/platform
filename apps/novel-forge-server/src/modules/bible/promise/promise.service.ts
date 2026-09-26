import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { type OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { type DueStanding, mysteryPromiseItem, nextWritableChapter, type PromiseItem, threadPromiseItem } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

import { type ListPromisesQuery } from './promise.dto';

/** The `sort=due` ranking: overdue, then due, then not_due. */
const DUE_RANK: Record<DueStanding, number> = { overdue: 0, due: 1, not_due: 2 };

@Injectable()
export class PromiseService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** `sort=due` sorts and pages in memory, bounded by the one project's threads-plus-mysteries this method already loads whole before paginating. */
  async list(projectId: bigint, filter: ListPromisesQuery): Promise<OffsetPaginationResult<PromiseItem>> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 25, offset: 0, sortBy: 'createdAt', sortOrder: 'asc' } });

    const [threads, mysteries, milestoneRows, volumeRows, chapter] = await Promise.all([
      this.db.query.plotThreads.findMany({
        where: eq(schema.plotThreads.projectId, projectId),
        columns: {
          threadKey: true,
          summary: true,
          status: true,
          intentionallyOpen: true,
          openedChapter: true,
          closedChapter: true,
          lastAdvancedChapter: true,
          payoffWindow: true,
          payoffMilestoneKey: true,
          payoffVolumeKey: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      // Never fetch `truthFactKey` here — P4-38: a promise never carries a mystery's truth, key or otherwise.
      this.db.query.mysteries.findMany({
        where: eq(schema.mysteries.projectId, projectId),
        columns: {
          mysteryKey: true,
          question: true,
          status: true,
          intentionallyOpen: true,
          openedChapter: true,
          resolvedChapter: true,
          lastAdvancedChapter: true,
          payoffWindow: true,
          payoffMilestoneKey: true,
          payoffVolumeKey: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.db.query.milestones.findMany({ where: eq(schema.milestones.projectId, projectId), columns: { milestoneKey: true, state: true } }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), columns: { volumeKey: true, state: true } }),
      nextWritableChapter(this.db, projectId),
    ]);

    const milestoneStates = new Map(milestoneRows.map(row => [row.milestoneKey, row.state]));
    const volumeStates = new Map(volumeRows.map(row => [row.volumeKey, row.state]));

    const items = [
      ...threads.map(thread => threadPromiseItem(thread, chapter, milestoneStates, volumeStates)),
      ...mysteries.map(mystery => mysteryPromiseItem(mystery, chapter, milestoneStates, volumeStates)),
    ].filter(item => (!filter.kind || item.kind === filter.kind) && (!filter.status || item.status === filter.status));

    const column = query.sortBy === 'updatedAt' ? 'updatedAt' : 'createdAt';
    const sign = query.sortOrder === 'desc' ? -1 : 1;
    const sorted =
      filter.sort === 'due'
        ? items.sort((left, right) => DUE_RANK[left.due] - DUE_RANK[right.due] || sign * (left.createdAt.getTime() - right.createdAt.getTime()))
        : items.sort((left, right) => sign * (left[column].getTime() - right[column].getTime()));

    return utils.pagination.createResult(query, sorted.slice(query.offset, query.offset + query.limit), sorted.length);
  }
}
