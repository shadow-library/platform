import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { deriveVolumeStats, EMPTY_VOLUME_STATS, nextVolumeToActivate, volumeContentHash, type VolumeStats } from '@server/common';
import { type Plan, type PrimaryDatabase, schema } from '@server/database';

import { type ListVolumesQuery } from './volume.dto';

export type VolumeWithStats = Plan.Volume & VolumeStats;

export interface VolumeAdvanceResult {
  completed: VolumeWithStats;
  activated: VolumeWithStats | null;
}

@Injectable()
export class VolumeService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private async statsByVolume(projectId: bigint, volumeKeys: readonly string[]): Promise<Map<string, VolumeStats>> {
    if (volumeKeys.length === 0) return new Map();
    const rows = await this.db.query.chapters.findMany({
      columns: { number: true, wordCount: true, volumeKey: true },
      where: and(eq(schema.chapters.projectId, projectId), inArray(schema.chapters.volumeKey, [...volumeKeys])),
    });
    const byVolume = new Map<string, { number: number; wordCount: number | null }[]>();
    for (const row of rows) {
      if (!row.volumeKey) continue;
      byVolume.set(row.volumeKey, [...(byVolume.get(row.volumeKey) ?? []), row]);
    }
    return new Map(volumeKeys.map(key => [key, deriveVolumeStats(byVolume.get(key) ?? [])]));
  }

  private async withStats(projectId: bigint, volumes: readonly Plan.Volume[]): Promise<VolumeWithStats[]> {
    const stats = await this.statsByVolume(
      projectId,
      volumes.map(volume => volume.volumeKey),
    );
    return volumes.map(volume => ({ ...volume, ...(stats.get(volume.volumeKey) ?? EMPTY_VOLUME_STATS) }));
  }

  async list(projectId: bigint, filter: ListVolumesQuery): Promise<OffsetPaginationResult<VolumeWithStats>> {
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

    return utils.pagination.createResult(query, await this.withStats(projectId, items), total);
  }

  async get(projectId: bigint, volumeKey: string): Promise<VolumeWithStats | null> {
    const volume = await this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)) });
    if (!volume) return null;
    const [withStats] = await this.withStats(projectId, [volume]);
    return withStats ?? null;
  }

  /**
   * "Goal met — start next": the author's click, never an automatic write. `volumeKey` must name the currently active volume — the
   * conditional update refuses (and the transaction never touches a second row) once it no longer is, so two concurrent clicks on the
   * same volume complete only one. The next not-started volume in ordinal order becomes active; if there is none, no volume does, and
   * the author is prompted to start one.
   */
  async advanceGoalMet(projectId: bigint, volumeKey: string): Promise<VolumeAdvanceResult> {
    return this.db.transaction(async tx => {
      const target = await tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)) });
      if (!target) throw AppErrorCode.VOL_001.create();

      const [completed] = await tx
        .update(schema.volumes)
        .set({
          state: 'goal_met',
          revision: target.revision + 1,
          contentHash: volumeContentHash({ ...target, state: 'goal_met' }),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.volumes.id, target.id), eq(schema.volumes.state, 'active')))
        .returning();
      if (!completed) throw AppErrorCode.VOL_003.create();

      const siblings = await tx.query.volumes.findMany({
        columns: { volumeKey: true, ordinal: true, state: true },
        where: eq(schema.volumes.projectId, projectId),
      });
      const nextKey = nextVolumeToActivate(siblings, volumeKey);

      let activated: Plan.Volume | null = null;
      if (nextKey) {
        const next = await tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, nextKey)) });
        if (next) {
          const [row] = await tx
            .update(schema.volumes)
            .set({
              state: 'active',
              revision: next.revision + 1,
              contentHash: volumeContentHash({ ...next, state: 'active' }),
              updatedAt: new Date(),
            })
            .where(and(eq(schema.volumes.id, next.id), eq(schema.volumes.state, 'not_started')))
            .returning();
          activated = row ?? null;
        }
      }

      const stats = await this.statsByVolume(projectId, activated ? [completed.volumeKey, activated.volumeKey] : [completed.volumeKey]);
      return {
        completed: { ...completed, ...(stats.get(completed.volumeKey) ?? EMPTY_VOLUME_STATS) },
        activated: activated ? { ...activated, ...(stats.get(activated.volumeKey) ?? EMPTY_VOLUME_STATS) } : null,
      };
    });
  }
}
