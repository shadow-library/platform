/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { arcContentHash } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Plan, type PrimaryDatabase, schema } from '@server/database';

import { type ApproveArcsResponse, type UpsertArcBody } from './arc.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class ArcService {
  private readonly logger = Logger.getLogger(APP_NAME, ArcService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  list(projectId: bigint, volumeKey: string): Promise<Plan.Arc[]> {
    return this.db.query.arcs.findMany({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.volumeKey, volumeKey)), orderBy: asc(schema.arcs.ordinal) });
  }

  async get(projectId: bigint, arcKey: string): Promise<Plan.Arc> {
    const arc = await this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, arcKey)) });
    if (!arc) throw AppErrorCode.ARC_001.create();
    return arc;
  }

  /** Hand-authoring upsert: creates draft arcs, edits existing ones, and always bumps revision/contentHash. */
  async upsert(projectId: bigint, arcKey: string, body: UpsertArcBody): Promise<Plan.Arc> {
    const volume = await this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, body.volumeKey)) });
    if (!volume) throw AppErrorCode.VOL_001.create();

    const existing = await this.db.query.arcs.findFirst({ where: and(eq(schema.arcs.projectId, projectId), eq(schema.arcs.arcKey, arcKey)) });
    const merged = {
      volumeKey: body.volumeKey,
      ordinal: body.ordinal ?? existing?.ordinal ?? 0,
      title: body.title ?? existing?.title ?? null,
      objective: body.objective ?? existing?.objective ?? null,
      escalation: body.escalation ?? existing?.escalation ?? null,
      payoff: body.payoff ?? existing?.payoff ?? null,
      hook: body.hook ?? existing?.hook ?? null,
      chapterStart: body.chapterStart ?? existing?.chapterStart ?? null,
      chapterEnd: body.chapterEnd ?? existing?.chapterEnd ?? null,
      cast: body.cast ?? existing?.cast ?? null,
      body: body.body ?? existing?.body ?? null,
    };
    this.assertWithinVolume(volume, merged.chapterStart, merged.chapterEnd);

    const contentHash = arcContentHash({ arcKey, ...merged });
    if (existing) {
      const [updated] = await this.db
        .update(schema.arcs)
        .set({ ...merged, revision: existing.revision + 1, contentHash, updatedAt: new Date() })
        .where(eq(schema.arcs.id, existing.id))
        .returning()
        .catch(err => this.databaseService.translateError(err));
      if (!updated) throw AppErrorCode.ARC_001.create();
      return updated;
    }

    const [created] = await this.db
      .insert(schema.arcs)
      .values({ projectId, arcKey, ...merged, contentHash })
      .returning()
      .catch(err => this.databaseService.translateError(err));
    if (!created) throw AppErrorCode.ARC_001.create();
    return created;
  }

  private assertWithinVolume(volume: Plan.Volume, chapterStart: number | null, chapterEnd: number | null): void {
    if (volume.startChapter === null || volume.endChapter === null || chapterStart === null || chapterEnd === null) return;
    if (chapterStart < volume.startChapter || chapterEnd > volume.endChapter) throw AppErrorCode.ARC_002.create();
  }

  /**
   * Approves a volume's arcs after validating the coverage invariant (design §4): ordered by
   * ordinal, the arcs must be contiguous, non-overlapping, and exactly cover the volume's range.
   * Approval clears staleness — the human has re-blessed the structure.
   */
  async approve(projectId: bigint, volumeKey: string): Promise<ApproveArcsResponse> {
    const volume = await this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)) });
    if (!volume) throw AppErrorCode.VOL_001.create();
    if (volume.status !== 'approved' || volume.startChapter === null || volume.endChapter === null) throw AppErrorCode.ARC_003.create();

    const arcs = await this.list(projectId, volumeKey);
    if (!this.coversExactly(arcs, volume.startChapter, volume.endChapter)) throw AppErrorCode.ARC_002.create();

    const approved = await this.db
      .update(schema.arcs)
      .set({ status: 'approved', staleReason: null, updatedAt: new Date() })
      .where(
        and(
          eq(schema.arcs.projectId, projectId),
          inArray(
            schema.arcs.id,
            arcs.map(arc => arc.id),
          ),
        ),
      )
      .returning();

    this.logger.info(`approved ${approved.length} arcs for volume ${volumeKey}`);
    return { arcsApproved: approved.length, approved: approved.length > 0 };
  }

  private coversExactly(arcs: Plan.Arc[], startChapter: number, endChapter: number): boolean {
    if (arcs.length === 0) return false;
    let expectedStart = startChapter;
    for (const arc of arcs) {
      if (arc.chapterStart !== expectedStart || arc.chapterEnd === null) return false;
      expectedStart = arc.chapterEnd + 1;
    }
    return expectedStart === endChapter + 1;
  }
}
