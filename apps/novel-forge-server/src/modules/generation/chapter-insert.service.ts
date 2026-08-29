import { and, asc, desc, eq, gt, gte, inArray, lt, lte, ne, sql } from 'drizzle-orm';
import { type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { assertActiveProject, markDescendantDraftsStale, renderBriefBody, shiftBriefBody, shiftChapterReferences } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type Generation, type Plan, type PrimaryDatabase, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { ModelRouterService } from '../ai/model-router.service';
import { buildOutlinePrompt } from '../ai/prompts';
import { type OutlineOutput } from '../ai/schemas';

export interface InsertOptions {
  briefOrigin: 'hand' | 'planner';
  briefBody?: string;
  intent?: string;
}

interface PlannedSlotBrief {
  body: string;
  title?: string;
  contextRefs?: string[];
  pov?: string;
  endingContract?: unknown;
  knowledgeContract?: unknown;
  chapterPurpose?: string;
  readerValue?: string[];
  repetitionRisks?: string[];
}

export interface InsertResult {
  brief: Generation.Brief;
  newChapter: number;
  shiftedChapters: number;
}

interface ShiftTarget {
  table: PgTable;
  projectId: PgColumn;
  column: PgColumn;
  field: string;
  updatedAt?: string;
}

/**
 * Every column in `src/database/schemas` that stores a forge chapter number, shifted by the same
 * two-phase pass. The list is an allow-list on purpose: an earlier version reasoned about which columns
 * could hold a value above the write frontier and got it wrong twice — `character_knowledge` is written
 * at draft approval, and `applyContinuityDelta` writes the entity/thread/mystery columns from a draft —
 * so "does this column store a chapter number?" is the only question asked here. A column is left out
 * only by an explicit entry in the deny-list below.
 *
 * Deny-list, with the reason each is not shifted:
 * - `chapter_publications.chapter`, `.published_ordinal` — frozen historical pointers; moving one moves a reader's URL.
 * - `projects.story_current_chapter` — a cursor over finalized prose, never above the frontier.
 * - `chapter_chunks.chapter`, `validation_reports.chapter`, `extraction_runs.chapter` — written only from `done` chapters.
 * - `volumes.start_chapter`/`end_chapter`, `arcs.chapter_start`/`chapter_end` — ranges, grown by `growPlan` rather than shifted.
 * - `chapter_conversions`, `chapter_reforges`, `rebrand_glossary`, `reforge_*` — keyed to source projects, outside this path.
 * - every `ordinal`, `*_count` and `chapters_analyzed` column — positions and counts, not chapter numbers.
 */
const SHIFT_TARGETS: ShiftTarget[] = [
  { table: schema.briefs, projectId: schema.briefs.projectId, column: schema.briefs.chapter, field: 'chapter', updatedAt: 'updatedAt' },
  { table: schema.drafts, projectId: schema.drafts.projectId, column: schema.drafts.chapter, field: 'chapter', updatedAt: 'updatedAt' },
  { table: schema.chapters, projectId: schema.chapters.projectId, column: schema.chapters.number, field: 'number', updatedAt: 'updatedAt' },
  { table: schema.chapterImages, projectId: schema.chapterImages.projectId, column: schema.chapterImages.chapter, field: 'chapter' },
  {
    table: schema.continuityProposals,
    projectId: schema.continuityProposals.projectId,
    column: schema.continuityProposals.chapter,
    field: 'chapter',
    updatedAt: 'updatedAt',
  },
  { table: schema.contextPacks, projectId: schema.contextPacks.projectId, column: schema.contextPacks.chapter, field: 'chapter' },
  { table: schema.entities, projectId: schema.entities.projectId, column: schema.entities.firstSeenChapter, field: 'firstSeenChapter', updatedAt: 'updatedAt' },
  { table: schema.entityRelationships, projectId: schema.entityRelationships.projectId, column: schema.entityRelationships.chapter, field: 'chapter' },
  { table: schema.entityAppearances, projectId: schema.entityAppearances.projectId, column: schema.entityAppearances.chapter, field: 'chapter' },
  { table: schema.entityAppearances, projectId: schema.entityAppearances.projectId, column: schema.entityAppearances.firstChapter, field: 'firstChapter' },
  { table: schema.entityAppearances, projectId: schema.entityAppearances.projectId, column: schema.entityAppearances.lastChapter, field: 'lastChapter' },
  { table: schema.relationshipObservations, projectId: schema.relationshipObservations.projectId, column: schema.relationshipObservations.chapter, field: 'chapter' },
  { table: schema.canonFacts, projectId: schema.canonFacts.projectId, column: schema.canonFacts.revealChapter, field: 'revealChapter', updatedAt: 'updatedAt' },
  { table: schema.characterKnowledge, projectId: schema.characterKnowledge.projectId, column: schema.characterKnowledge.learnedInChapter, field: 'learnedInChapter' },
  {
    table: schema.characterStates,
    projectId: schema.characterStates.projectId,
    column: schema.characterStates.lastUpdatedChapter,
    field: 'lastUpdatedChapter',
    updatedAt: 'updatedAt',
  },
  { table: schema.beats, projectId: schema.beats.projectId, column: schema.beats.chapter, field: 'chapter' },
  { table: schema.worldFacts, projectId: schema.worldFacts.projectId, column: schema.worldFacts.chapter, field: 'chapter', updatedAt: 'updatedAt' },
  { table: schema.plotThreads, projectId: schema.plotThreads.projectId, column: schema.plotThreads.openedChapter, field: 'openedChapter', updatedAt: 'updatedAt' },
  { table: schema.plotThreads, projectId: schema.plotThreads.projectId, column: schema.plotThreads.closedChapter, field: 'closedChapter' },
  { table: schema.plotThreads, projectId: schema.plotThreads.projectId, column: schema.plotThreads.lastAdvancedChapter, field: 'lastAdvancedChapter' },
  { table: schema.plotThreads, projectId: schema.plotThreads.projectId, column: schema.plotThreads.payoffWindow, field: 'payoffWindow' },
  { table: schema.mysteries, projectId: schema.mysteries.projectId, column: schema.mysteries.openedChapter, field: 'openedChapter', updatedAt: 'updatedAt' },
  { table: schema.mysteries, projectId: schema.mysteries.projectId, column: schema.mysteries.resolvedChapter, field: 'resolvedChapter' },
  { table: schema.mysteries, projectId: schema.mysteries.projectId, column: schema.mysteries.lastAdvancedChapter, field: 'lastAdvancedChapter' },
  { table: schema.mysteries, projectId: schema.mysteries.projectId, column: schema.mysteries.payoffWindow, field: 'payoffWindow' },
];

const INSERT_STALE_REASON = 'a chapter was inserted after this point';

/**
 * Inserts a chapter slot the plan never allocated (interstitial-chapter design §7): one transaction that
 * renumbers everything above the insert point, re-renders the briefs it moved, grows the arc and volume
 * ranges, and lands an `external` write-mode brief in the hole. Legal only ahead of the write frontier,
 * which is what keeps finalized canon — and `chapter_publications.publishedOrdinal` with it — immovable.
 */
@Injectable()
export class ChapterInsertService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterInsertService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly contextAssembler: ContextAssembler,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async insertAfter(projectId: bigint, afterChapter: number, opts: InsertOptions): Promise<InsertResult> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertActiveProject(project);
    if (opts.briefOrigin === 'hand' ? !opts.briefBody?.trim() : !opts.intent?.trim()) throw AppErrorCode.S003.create();

    await this.assertInsertable(projectId, afterChapter);

    const newChapter = afterChapter + 1;
    // The planner call can take minutes; running it here rather than inside the transaction keeps it off
    // the locks the renumber holds across every chapter-keyed table. The guards are re-asserted once it returns.
    const planned: PlannedSlotBrief = opts.briefOrigin === 'hand' ? { body: opts.briefBody as string } : await this.planBrief(projectId, afterChapter, opts.intent as string);

    const result = await this.db.transaction(async tx => {
      // Serializes concurrent inserts on the same project. Without it two callers both pass the guards
      // under READ COMMITTED and the second reads its `shifted` snapshot before blocking on the row locks,
      // so its brief.chapter + 1 mapping would be applied to rows the first insert had already moved.
      await tx.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, projectId)).for('update');
      await this.assertInsertable(projectId, afterChapter, tx);

      const shifted = await tx.query.briefs.findMany({
        where: and(eq(schema.briefs.projectId, projectId), gt(schema.briefs.chapter, afterChapter)),
        orderBy: asc(schema.briefs.chapter),
      });
      const [volume, arc] = await Promise.all([this.coveringVolume(projectId, afterChapter, tx), this.coveringArc(projectId, afterChapter, tx)]);

      // Phase 1 parks every value above the insert point at its own negation, an involution onto a range no
      // live row occupies, so no two parked rows and no parked-vs-unmoved pair can collide. Phase 2 lands
      // them at `-n + 1`, which is bounded below by afterChapter + 2 and so clears every unmoved row too.
      // Both phases run for every column before anything is inserted at the freed number, and every column
      // takes this path whether or not a unique constraint covers it — uniformity over per-column analysis.
      for (const target of SHIFT_TARGETS) await this.parkAbove(tx, projectId, afterChapter, target);
      for (const target of SHIFT_TARGETS) await this.landParked(tx, projectId, target);

      for (const brief of shifted) await this.rewriteShiftedBrief(tx, projectId, afterChapter, brief);

      await this.growPlan(tx, projectId, afterChapter, volume, arc);

      const [brief] = await tx
        .insert(schema.briefs)
        .values({
          projectId,
          chapter: newChapter,
          volumeKey: volume?.volumeKey ?? null,
          arcKey: arc?.arcKey ?? null,
          title: planned.title ?? null,
          body: planned.body,
          contextRefs: planned.contextRefs ?? null,
          pov: planned.pov ?? null,
          endingContract: planned.endingContract ?? null,
          knowledgeContract: planned.knowledgeContract ?? null,
          chapterPurpose: planned.chapterPurpose ?? null,
          readerValue: planned.readerValue ?? null,
          repetitionRisks: planned.repetitionRisks ?? null,
          writeMode: 'external',
          handEdited: true,
          insertedAt: new Date(),
        })
        .returning();
      if (!brief) throw AppErrorCode.S001.create();

      await markDescendantDraftsStale(tx, projectId, afterChapter, INSERT_STALE_REASON);
      return { brief, newChapter, shiftedChapters: shifted.length };
    });

    this.logger.info('inserted a chapter', { projectId, afterChapter, newChapter, shiftedBriefs: result.shiftedChapters, briefOrigin: opts.briefOrigin });
    return result;
  }

  /** `max(number)` over finalized chapters — inserting at it is legal, inserting behind it would move canon. */
  private async writeFrontier(projectId: bigint, db: DbExecutor = this.db): Promise<number> {
    const latest = await db.query.chapters.findFirst({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')),
      orderBy: desc(schema.chapters.number),
      columns: { number: true },
    });
    return latest?.number ?? 0;
  }

  private async assertInsertable(projectId: bigint, afterChapter: number, db: DbExecutor = this.db): Promise<void> {
    const frontier = await this.writeFrontier(projectId, db);
    if (afterChapter < frontier) throw AppErrorCode.CHP_003.create();
    if (afterChapter > 0 && afterChapter > (await this.highestChapter(projectId, db))) throw AppErrorCode.CHP_001.create();

    // The same query `GenerationService.generate` uses for its ordering guard: a batch mid-write would
    // have chapter numbers shifted out from under the drafts it is persisting.
    const activeJob = await db.query.jobs.findFirst({
      where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, 'generate'), inArray(schema.jobs.status, ['pending', 'in_progress'])),
      columns: { id: true },
    });
    if (activeJob) throw AppErrorCode.CHP_004.create();
  }

  private async parkAbove(tx: DbExecutor, projectId: bigint, afterChapter: number, target: ShiftTarget): Promise<void> {
    await tx
      .update(target.table)
      .set({ [target.field]: sql`-${target.column}` } as never)
      .where(and(eq(target.projectId, projectId), gt(target.column, afterChapter)));
  }

  private async landParked(tx: DbExecutor, projectId: bigint, target: ShiftTarget): Promise<void> {
    const set: Record<string, unknown> = { [target.field]: sql`-${target.column} + 1` };
    if (target.updatedAt) set[target.updatedAt] = new Date();
    await tx
      .update(target.table)
      .set(set as never)
      .where(and(eq(target.projectId, projectId), lt(target.column, 0)));
  }

  private async rewriteShiftedBrief(tx: DbExecutor, projectId: bigint, afterChapter: number, brief: Generation.Brief): Promise<void> {
    await tx
      .update(schema.briefs)
      .set({
        body: shiftBriefBody(brief.body, afterChapter),
        contextRefs: shiftChapterReferences(brief.contextRefs, afterChapter),
        knowledgeContract: shiftChapterReferences(brief.knowledgeContract, afterChapter),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, brief.chapter + 1)));
  }

  /**
   * Silent growth per design decision 5 — no `staleReason` on the arc or volume rows. The covering row
   * grows its end alone, so `arcs_chapter_range_check` cannot see a half-shifted range; every other row
   * past the insert point moves both bounds in one statement, and is excluded by id from the growth
   * above so the clamped `afterChapter = 0` case grows the first arc instead of shifting it away.
   */
  private async growPlan(tx: DbExecutor, projectId: bigint, afterChapter: number, volume?: Plan.Volume, arc?: Plan.Arc): Promise<void> {
    if (arc) {
      await tx
        .update(schema.arcs)
        .set({ chapterEnd: sql`${schema.arcs.chapterEnd} + 1`, updatedAt: new Date() })
        .where(eq(schema.arcs.id, arc.id));
    }
    await tx
      .update(schema.arcs)
      .set({ chapterStart: sql`${schema.arcs.chapterStart} + 1`, chapterEnd: sql`${schema.arcs.chapterEnd} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.arcs.projectId, projectId), gt(schema.arcs.chapterStart, afterChapter), arc ? ne(schema.arcs.id, arc.id) : undefined));

    if (volume) {
      await tx
        .update(schema.volumes)
        .set({ endChapter: sql`${schema.volumes.endChapter} + 1`, targetChapterCount: sql`${schema.volumes.targetChapterCount} + 1`, updatedAt: new Date() })
        .where(eq(schema.volumes.id, volume.id));
    }
    await tx
      .update(schema.volumes)
      .set({ startChapter: sql`${schema.volumes.startChapter} + 1`, endChapter: sql`${schema.volumes.endChapter} + 1`, updatedAt: new Date() })
      .where(and(eq(schema.volumes.projectId, projectId), gt(schema.volumes.startChapter, afterChapter), volume ? ne(schema.volumes.id, volume.id) : undefined));
  }

  /** Highest number any chapter or brief occupies — inserting past it would strand the new brief in an unplanned hole. */
  private async highestChapter(projectId: bigint, db: DbExecutor): Promise<number> {
    const [chapter, brief] = await Promise.all([
      db.query.chapters.findFirst({ where: eq(schema.chapters.projectId, projectId), orderBy: desc(schema.chapters.number), columns: { number: true } }),
      db.query.briefs.findFirst({ where: eq(schema.briefs.projectId, projectId), orderBy: desc(schema.briefs.chapter), columns: { chapter: true } }),
    ]);
    return Math.max(chapter?.number ?? 0, brief?.chapter ?? 0);
  }

  /**
   * The volume the new chapter joins. `afterChapter = 0` precedes every planned range, so it clamps to
   * the first volume — which then grows to cover chapter 1 rather than shifting away and orphaning it.
   */
  private async coveringVolume(projectId: bigint, chapter: number, db: DbExecutor): Promise<Plan.Volume | undefined> {
    const containing = await db.query.volumes.findFirst({
      where: and(eq(schema.volumes.projectId, projectId), lte(schema.volumes.startChapter, chapter), gte(schema.volumes.endChapter, chapter)),
    });
    if (containing) return containing;
    const first = await db.query.volumes.findFirst({ where: eq(schema.volumes.projectId, projectId), orderBy: asc(schema.volumes.ordinal) });
    return first && first.startChapter !== null && chapter < first.startChapter ? first : undefined;
  }

  /** The arc the new chapter joins, clamped to the first arc for the same reason as `coveringVolume`. */
  private async coveringArc(projectId: bigint, chapter: number, db: DbExecutor): Promise<Plan.Arc | undefined> {
    const containing = await db.query.arcs.findFirst({
      where: and(eq(schema.arcs.projectId, projectId), lte(schema.arcs.chapterStart, chapter), gte(schema.arcs.chapterEnd, chapter)),
    });
    if (containing) return containing;
    const first = await db.query.arcs.findFirst({ where: eq(schema.arcs.projectId, projectId), orderBy: asc(schema.arcs.ordinal) });
    return first && first.chapterStart !== null && chapter < first.chapterStart ? first : undefined;
  }

  /**
   * Drafts the hole's brief from a one-line intent with the outline prompt bound to the single new
   * chapter — the same path `outlineArc` uses, so an inserted brief carries the same authored fields an
   * outlined one does. Neighbours are rendered at their post-shift numbers because the model is asked
   * about the plan as it will read once the renumber commits.
   */
  private async planBrief(projectId: bigint, afterChapter: number, intent: string): Promise<PlannedSlotBrief> {
    const newChapter = afterChapter + 1;
    const [pack, volume, arc, neighbours] = await Promise.all([
      this.contextAssembler.forOutline(projectId, newChapter),
      this.coveringVolume(projectId, afterChapter, this.db),
      this.coveringArc(projectId, afterChapter, this.db),
      this.db.query.briefs.findMany({
        where: and(eq(schema.briefs.projectId, projectId), gte(schema.briefs.chapter, afterChapter), lte(schema.briefs.chapter, afterChapter + 1)),
        orderBy: asc(schema.briefs.chapter),
      }),
    ]);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    const surrounding = neighbours.map(brief => `## Chapter ${brief.chapter > afterChapter ? brief.chapter + 1 : brief.chapter}: ${brief.title ?? ''}\n${brief.body}`).join('\n\n');
    const catalog = [pack.rendered, surrounding && `## Surrounding chapters (as they will be numbered)\n${surrounding}`].filter(Boolean).join('\n\n');
    const volumePlan = [
      volume ? `## Volume: ${volume.title ?? volume.volumeKey} (${volume.volumeKey})\nObjective: ${volume.objective ?? ''}\nConflict: ${volume.conflict ?? ''}` : '',
      arc ? `## Arc: ${arc.title ?? arc.arcKey} (${arc.arcKey})\nObjective: ${arc.objective ?? ''}\nEscalation: ${arc.escalation ?? ''}\nPayoff: ${arc.payoff ?? ''}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const prompt = buildOutlinePrompt(newChapter, newChapter);
    const ctx = { projectId, promptKey: prompt.key, promptVersion: prompt.version, role: prompt.key };
    const vars = { catalog, volumePlan, startChapter: newChapter, endChapter: newChapter, extraContext: `Insert a single new chapter here. Author's intent: ${intent}` };
    const outlined = (await this.modelRouter.structured(prompt, vars, ctx, project as never)) as OutlineOutput;

    const chapter = outlined[0];
    if (!chapter) throw AppErrorCode.BRF_001.create();
    return { ...chapter, contextRefs: chapter.requiredContext, body: renderBriefBody(chapter) };
  }
}
