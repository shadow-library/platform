/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { volumeContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Plan, type PrimaryDatabase, schema } from '@server/database';

import { approveVolumePlan } from './volume.approve';
import { type ApprovePlanResponse, type CreateVolumeBody, type ListVolumesQuery, type UpdateVolumeBody } from './volume.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class VolumeService {
  private readonly logger = Logger.getLogger(APP_NAME, VolumeService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async create(projectId: bigint, body: CreateVolumeBody): Promise<Plan.Volume> {
    const contentHash = volumeContentHash(body as unknown as Record<string, unknown>);
    const [volume] = await this.db
      .insert(schema.volumes)
      .values({ projectId, ...body, contentHash })
      .onConflictDoUpdate({
        target: [schema.volumes.projectId, schema.volumes.volumeKey],
        set: {
          ordinal: body.ordinal,
          title: body.title,
          objective: body.objective,
          conflict: body.conflict,
          payoff: body.payoff,
          startChapter: body.startChapter,
          endChapter: body.endChapter,
          targetChapterCount: body.targetChapterCount,
          status: body.status,
          cast: body.cast,
          body: body.body,
          contentHash,
          revision: sql`${schema.volumes.revision} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!volume) throw AppErrorCode.S001.create();
    return volume;
  }

  async list(projectId: bigint, filter: ListVolumesQuery): Promise<OffsetPaginationResult<Plan.Volume>> {
    const query = utils.pagination.normalise(filter, {
      mode: 'offset',
      defaults: { limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'asc' },
    });

    const conditions = [eq(schema.volumes.projectId, projectId)];
    if (filter.status) conditions.push(eq(schema.volumes.status, filter.status));
    const where = and(...conditions);

    const column = query.sortBy === 'createdAt' ? schema.volumes.createdAt : schema.volumes.updatedAt;
    const order = query.sortOrder === 'asc' ? asc(column) : desc(column);

    const [total, items] = await Promise.all([
      this.db.$count(schema.volumes, where),
      this.db.query.volumes.findMany({ where, limit: query.limit, offset: query.offset, orderBy: order }),
    ]);

    return utils.pagination.createResult(query, items, total);
  }

  get(projectId: bigint, volumeKey: string): Promise<Plan.Volume | null> {
    return this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)) }).then(r => r ?? null);
  }

  async update(projectId: bigint, volumeKey: string, update: UpdateVolumeBody): Promise<Plan.Volume> {
    const existing = await this.get(projectId, volumeKey);
    if (!existing) throw AppErrorCode.VOL_001.create();

    const contentHash = volumeContentHash({ ...existing, ...update } as Record<string, unknown>);
    const [result] = await this.db
      .update(schema.volumes)
      .set({ ...update, contentHash, revision: existing.revision + 1, updatedAt: new Date() })
      .where(eq(schema.volumes.id, existing.id))
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!result) throw AppErrorCode.VOL_001.create();
    return result;
  }

  async delete(projectId: bigint, volumeKey: string): Promise<void> {
    const result = await this.db
      .delete(schema.volumes)
      .where(and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)))
      .returning();

    if (result.length === 0) throw AppErrorCode.VOL_001.create();
  }

  approve(projectId: bigint): Promise<ApprovePlanResponse> {
    return approveVolumePlan(this.db, projectId);
  }
}
