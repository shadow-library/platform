import { and, asc, eq, ne } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type ReforgeTransform, schema } from '@server/database';

// A direct file import of the landing helper, never the novel-import barrel — the barrel's services
// would drag their module in, exactly as chapter-reforge.graph.ts imports residue-scan directly.
import { landFinalChapters } from '../novel-import/land-chapters';
import { ReforgePlanService } from './reforge-plan.service';

export interface PromoteOptions {
  title?: string;
  /** Writes the plan's detected arc boundaries as volumes, so the promoted project is immediately plannable. */
  seedVolumes?: boolean;
  onProgress?: (progress: { done: number; total: number; current: string; phase: string }) => Promise<void>;
}

export interface PromoteResult {
  projectId: bigint;
  chapters: number;
  volumes: number;
  alreadyPromoted: boolean;
}

@Injectable()
export class ReforgePromoteService {
  private readonly logger = Logger.getLogger(APP_NAME, ReforgePromoteService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly planService: ReforgePlanService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Throws `REF_009` unless every output chapter the approved plan derives has landed without failing. */
  async assertPromotable(projectId: bigint): Promise<ReforgeTransform.Plan> {
    const plan = await this.planService.getApproved(projectId).catch(() => {
      throw AppErrorCode.REF_009.create();
    });
    const outputs = await this.db
      .select({ outputChapter: schema.reforgeOutputs.outputChapter })
      .from(schema.reforgeOutputs)
      .where(and(eq(schema.reforgeOutputs.planId, plan.id), ne(schema.reforgeOutputs.status, 'failed')));
    if (outputs.length !== plan.outputChapterCount) throw AppErrorCode.REF_009.create({ written: outputs.length, expected: plan.outputChapterCount });
    return plan;
  }

  /**
   * Lands the approved plan's outputs as a publishable `new_novel` project. Idempotent per plan
   * revision: a revision that already promoted returns its project rather than duplicating a book.
   */
  async promote(projectId: bigint, options: PromoteOptions = {}): Promise<PromoteResult> {
    const plan = await this.assertPromotable(projectId);
    if (plan.promotedProjectId) {
      this.logger.info('reforge plan already promoted', { projectId, planId: plan.id, promotedProjectId: plan.promotedProjectId });
      return { projectId: plan.promotedProjectId, chapters: 0, volumes: 0, alreadyPromoted: true };
    }

    const source = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!source) throw AppErrorCode.PRJ_001.create();
    const outputs = await this.db.query.reforgeOutputs.findMany({
      where: and(eq(schema.reforgeOutputs.planId, plan.id), ne(schema.reforgeOutputs.status, 'failed')),
      orderBy: [asc(schema.reforgeOutputs.outputChapter)],
    });

    const title = options.title?.trim() || source.title || source.name;
    const promoted = await this.db.transaction(async rawTx => {
      const tx = rawTx as unknown as PrimaryDatabase;
      const [project] = await tx
        .insert(schema.projects)
        .values({
          ownerId: source.ownerId,
          name: title,
          kind: 'new_novel',
          title,
          brief: source.brief,
          premise: source.premise,
          themes: source.themes,
          contentMode: source.contentMode,
          coverImagePath: source.coverImagePath,
          sourceProjectId: source.id,
        })
        .returning()
        .catch(err => this.databaseService.translateError(err));
      if (!project) throw AppError.internal(`failed to create the promoted project for plan ${plan.id}`);

      // Mirrors ProjectService.create: a `new_novel` project is born with contentless `<section>/default`
      // placeholder bible docs, filled later by extraction or the chat hub like any imported final novel.
      await tx.insert(schema.bibleDocuments).values(schema.bibleSection.enumValues.map(section => ({ projectId: project.id, section, slug: 'default' })));
      return project;
    });

    await options.onProgress?.({ done: 0, total: outputs.length, current: '1', phase: 'promoting' });
    const chapters = await landFinalChapters(
      this.db,
      promoted.id,
      outputs.map(output => ({ title: output.title, content: output.body })),
      { onBatch: async (done, total) => options.onProgress?.({ done, total, current: String(Math.min(done + 1, total)), phase: 'promoting' }) },
    );

    const volumes = options.seedVolumes ? await this.seedVolumes(plan.id, promoted.id, options) : 0;

    await this.db.update(schema.reforgePlans).set({ promotedProjectId: promoted.id, updatedAt: new Date() }).where(eq(schema.reforgePlans.id, plan.id));
    this.logger.info('reforge plan promoted', { projectId, planId: plan.id, promotedProjectId: promoted.id, chapters, volumes });
    return { projectId: promoted.id, chapters, volumes, alreadyPromoted: false };
  }

  /** Arc boundaries are already in the plan, so a volume per run of spans sharing an `arcLabel` costs nothing. */
  private async seedVolumes(planId: bigint, promotedProjectId: bigint, options: PromoteOptions): Promise<number> {
    await options.onProgress?.({ done: 0, total: 1, current: 'volumes', phase: 'seeding' });
    const spans = await this.planService.listSpans(planId);

    const arcs: { label: string; startChapter: number; endChapter: number }[] = [];
    let cursor = 0;
    for (const span of spans) {
      const first = cursor + 1;
      cursor += span.targetChapters;
      if (span.targetChapters === 0 || !span.arcLabel) continue;
      const current = arcs.at(-1);
      if (current?.label === span.arcLabel) current.endChapter = cursor;
      else arcs.push({ label: span.arcLabel, startChapter: first, endChapter: cursor });
    }
    if (arcs.length === 0) return 0;

    await this.db.insert(schema.volumes).values(
      arcs.map((arc, index) => ({
        projectId: promotedProjectId,
        volumeKey: `vol-${index + 1}`,
        ordinal: index + 1,
        title: arc.label,
        startChapter: arc.startChapter,
        endChapter: arc.endChapter,
        targetChapterCount: arc.endChapter - arc.startChapter + 1,
      })),
    );
    return arcs.length;
  }
}
