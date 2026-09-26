import { and, asc, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { type Plan, type PrimaryDatabase, schema } from '@server/database';

import { type ListVolumesQuery } from './volume.dto';

@Injectable()
export class VolumeService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async list(projectId: bigint, filter: ListVolumesQuery): Promise<OffsetPaginationResult<Plan.Volume>> {
    const query = utils.pagination.normalise(filter, {
      mode: 'offset',
      defaults: { limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'asc' },
    });

    const where = eq(schema.volumes.projectId, projectId);
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
}
