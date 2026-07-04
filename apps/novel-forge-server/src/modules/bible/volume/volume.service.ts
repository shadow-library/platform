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
import { type Plan, type PrimaryDatabase, schema } from '@server/database';

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
    const [volume] = await this.db
      .insert(schema.volumes)
      .values({ projectId, ...body })
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
          status: body.status,
          cast: body.cast,
          body: body.body,
          updatedAt: new Date(),
        },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!volume) throw new ServerError(AppErrorCode.PRJ_002);
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
    const [result] = await this.db
      .update(schema.volumes)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)))
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!result) throw new ServerError(AppErrorCode.VOL_001);
    return result;
  }

  async delete(projectId: bigint, volumeKey: string): Promise<void> {
    const result = await this.db
      .delete(schema.volumes)
      .where(and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)))
      .returning();

    if (result.length === 0) throw new ServerError(AppErrorCode.VOL_001);
  }

  async approve(projectId: bigint): Promise<ApprovePlanResponse> {
    const result = await this.db.update(schema.volumes).set({ status: 'approved', updatedAt: new Date() }).where(eq(schema.volumes.projectId, projectId)).returning();

    return { volumesApproved: result.length, approved: result.length > 0 };
  }
}
