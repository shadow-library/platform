import { and, asc, desc, eq, gt, gte, lt, lte, ne, sql } from 'drizzle-orm';
import { type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import {
  enforcePlanWrite,
  markDescendantDraftsStale,
  nearestVolumeKey,
  renderBriefBody,
  renderSceneEvents,
  shiftBriefBody,
  shiftChapterReferences,
  shiftFactUnlocks,
} from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type Generation, type PrimaryDatabase, schema } from '@server/database';

import { defaultChapterMode } from '../ai/chapter-route';
import { loadRevealGuard, sanitiseBriefReveals } from '../ai/context/canon-guard';
import { ContextAssembler } from '../ai/context/context-assembler.service';
import { ModelRouterService } from '../ai/model-router.service';
import { buildOutlinePrompt, outlineWordTargetVars } from '../ai/prompts';
import { type OutlineOutput } from '../ai/schemas';
import { shiftLedgerBriefLinks } from '../ledger/ledger-entries';
import { resolveWordTarget } from '../eval/deterministic-metrics';
import { AuthoringClaimService } from '../jobs/authoring-claim.service';
import { PluginPolicyService } from '../plugins/plugin-policy.service';

export interface InsertOptions {
  briefOrigin: 'hand' | 'planner';
  briefBody?: string;
  intent?: string;
}

export interface PlannedSlotBrief {
  body: string;
  title?: string;
  contextRefs?: string[];
  pov?: string;
  endingContract?: unknown;
  knowledgeContract?: unknown;
  chapterPurpose?: string;
  readerValue?: string[];
  repetitionRisks?: string[];
  densityRisk?: string;
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
 * - `chapter_chunks.chapter`, `validation_reports.chapter` — written only from `done` chapters.
 * - `canon_facts.disclosed_in_chapter`, `milestones.reached_chapter` — set only when their chapter is finalized, and insert is refused behind
 *   the finalized frontier, so neither can hold a number above the insert point.
 * - every `ordinal` and `*_count` column — positions and counts, not chapter numbers.
 *
 * `decision_ledger_entries.links.briefChapters` and the `{chapter: N}` terms of `canon_facts.unlock` are jsonb, not columns, and are shifted by
 * `shiftLedgerBriefLinks` and `shiftFactUnlocks` in the same transaction.
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
  { table: schema.chapterReviews, projectId: schema.chapterReviews.projectId, column: schema.chapterReviews.chapter, field: 'chapter' },
  { table: schema.entities, projectId: schema.entities.projectId, column: schema.entities.firstSeenChapter, field: 'firstSeenChapter', updatedAt: 'updatedAt' },
  { table: schema.entityRelationships, projectId: schema.entityRelationships.projectId, column: schema.entityRelationships.chapter, field: 'chapter' },
  { table: schema.entityAppearances, projectId: schema.entityAppearances.projectId, column: schema.entityAppearances.chapter, field: 'chapter' },
  { table: schema.entityAppearances, projectId: schema.entityAppearances.projectId, column: schema.entityAppearances.firstChapter, field: 'firstChapter' },
  { table: schema.entityAppearances, projectId: schema.entityAppearances.projectId, column: schema.entityAppearances.lastChapter, field: 'lastChapter' },
  { table: schema.canonFacts, projectId: schema.canonFacts.projectId, column: schema.canonFacts.revealChapter, field: 'revealChapter', updatedAt: 'updatedAt' },
  { table: schema.canonFacts, projectId: schema.canonFacts.projectId, column: schema.canonFacts.plannedChapter, field: 'plannedChapter' },
  { table: schema.milestones, projectId: schema.milestones.projectId, column: schema.milestones.plannedChapter, field: 'plannedChapter', updatedAt: 'updatedAt' },
  { table: schema.characterKnowledge, projectId: schema.characterKnowledge.projectId, column: schema.characterKnowledge.learnedInChapter, field: 'learnedInChapter' },
  {
    table: schema.characterStates,
    projectId: schema.characterStates.projectId,
    column: schema.characterStates.lastUpdatedChapter,
    field: 'lastUpdatedChapter',
    updatedAt: 'updatedAt',
  },
  { table: schema.worldFacts, projectId: schema.worldFacts.projectId, column: schema.worldFacts.chapter, field: 'chapter', updatedAt: 'updatedAt' },
  { table: schema.plotThreads, projectId: schema.plotThreads.projectId, column: schema.plotThreads.openedChapter, field: 'openedChapter', updatedAt: 'updatedAt' },
  { table: schema.plotThreads, projectId: schema.plotThreads.projectId, column: schema.plotThreads.closedChapter, field: 'closedChapter' },
  { table: schema.plotThreads, projectId: schema.plotThreads.projectId, column: schema.plotThreads.lastAdvancedChapter, field: 'lastAdvancedChapter' },
  { table: schema.plotThreads, projectId: schema.plotThreads.projectId, column: schema.plotThreads.payoffWindow, field: 'payoffWindow' },
  { table: schema.mysteries, projectId: schema.mysteries.projectId, column: schema.mysteries.openedChapter, field: 'openedChapter', updatedAt: 'updatedAt' },
  { table: schema.mysteries, projectId: schema.mysteries.projectId, column: schema.mysteries.resolvedChapter, field: 'resolvedChapter' },
  { table: schema.mysteries, projectId: schema.mysteries.projectId, column: schema.mysteries.lastAdvancedChapter, field: 'lastAdvancedChapter' },
  { table: schema.mysteries, projectId: schema.mysteries.projectId, column: schema.mysteries.payoffWindow, field: 'payoffWindow' },
  { table: schema.modelCalls, projectId: schema.modelCalls.projectId, column: schema.modelCalls.chapter, field: 'chapter' },
  { table: schema.characterEvents, projectId: schema.characterEvents.projectId, column: schema.characterEvents.chapter, field: 'chapter' },
];

const INSERT_STALE_REASON = 'a chapter was inserted after this point';

/**
 * Inserts a chapter slot the plan never allocated: one transaction that
 * renumbers everything above the insert point, re-renders the briefs it moved, and lands an `external`
 * write-mode brief in the hole, in the volume of the chapter it follows. Legal only after the last written chapter and under the authoring claim.
 */
@Injectable()
export class ChapterInsertService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterInsertService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly contextAssembler: ContextAssembler,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly claims: AuthoringClaimService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async insertAfter(projectId: bigint, afterChapter: number, opts: InsertOptions): Promise<InsertResult> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (opts.briefOrigin === 'hand' ? !opts.briefBody?.trim() : !opts.intent?.trim()) throw AppErrorCode.S003.create();

    await this.assertInsertable(projectId, afterChapter);
    return this.claims.runExclusive(
      projectId,
      'plan',
      () => AppErrorCode.CHP_004.create(),
      () => this.insertClaimed(projectId, afterChapter, opts),
    );
  }

  private async insertClaimed(projectId: bigint, afterChapter: number, opts: InsertOptions): Promise<InsertResult> {
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
      const volumeKey = await nearestVolumeKey(tx, projectId, afterChapter);

      // Phase 1 parks every value above the insert point at its own negation, an involution onto a range no
      // live row occupies, so no two parked rows and no parked-vs-unmoved pair can collide. Phase 2 lands
      // them at `-n + 1`, which is bounded below by afterChapter + 2 and so clears every unmoved row too.
      // Both phases run for every column before anything is inserted at the freed number, and every column
      // takes this path whether or not a unique constraint covers it — uniformity over per-column analysis.
      for (const target of SHIFT_TARGETS) await this.parkAbove(tx, projectId, afterChapter, target);
      for (const target of SHIFT_TARGETS) await this.landParked(tx, projectId, target);
      await shiftLedgerBriefLinks(tx, projectId, afterChapter);
      await shiftFactUnlocks(tx, projectId, afterChapter);

      for (const brief of shifted) await this.rewriteShiftedBrief(tx, projectId, afterChapter, brief);

      const [brief] = await tx
        .insert(schema.briefs)
        .values({
          projectId,
          chapter: newChapter,
          volumeKey,
          title: planned.title ?? null,
          body: planned.body,
          contextRefs: planned.contextRefs ?? null,
          pov: planned.pov ?? null,
          endingContract: planned.endingContract ?? null,
          knowledgeContract: planned.knowledgeContract ?? null,
          chapterPurpose: planned.chapterPurpose ?? null,
          readerValue: planned.readerValue ?? null,
          repetitionRisks: planned.repetitionRisks ?? null,
          densityRisk: planned.densityRisk?.trim() || null,
          writeMode: 'external',
          contentMode: await defaultChapterMode(tx, projectId),
          handEdited: true,
          insertedAt: new Date(),
        })
        .returning();
      if (!brief) throw AppErrorCode.S001.create();

      await markDescendantDraftsStale(tx, projectId, afterChapter, INSERT_STALE_REASON);
      await enforcePlanWrite(tx, projectId, [newChapter]);
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

    // Renumbering written prose would break the next-chapter rule; plans after the insert point shift freely.
    const writtenAfter = await db.query.drafts.findFirst({
      where: and(eq(schema.drafts.projectId, projectId), gt(schema.drafts.chapter, afterChapter)),
      orderBy: asc(schema.drafts.chapter),
      columns: { chapter: true },
    });
    if (writtenAfter) throw AppErrorCode.CHP_009.create({ chapter: String(writtenAfter.chapter) });
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

  /** Highest number any chapter or brief occupies — inserting past it would strand the new brief in an unplanned hole. */
  private async highestChapter(projectId: bigint, db: DbExecutor): Promise<number> {
    const [chapter, brief] = await Promise.all([
      db.query.chapters.findFirst({ where: eq(schema.chapters.projectId, projectId), orderBy: desc(schema.chapters.number), columns: { number: true } }),
      db.query.briefs.findFirst({ where: eq(schema.briefs.projectId, projectId), orderBy: desc(schema.briefs.chapter), columns: { chapter: true } }),
    ]);
    return Math.max(chapter?.number ?? 0, brief?.chapter ?? 0);
  }

  private planBrief(projectId: bigint, afterChapter: number, intent: string): Promise<PlannedSlotBrief> {
    return this.outlineSlot(projectId, afterChapter + 1, `Insert a single new chapter here. Author's intent: ${intent}`, true);
  }

  /**
   * Drafts one chapter's brief with the outline prompt bound to that single chapter, so the brief carries the same authored fields an
   * outlined one does. For an insert, neighbours are rendered at their post-shift numbers because the model is asked about the plan as it
   * will read once the renumber commits.
   */
  private async outlineSlot(projectId: bigint, chapter: number, extraContext: string, insert: boolean, runId?: string): Promise<PlannedSlotBrief> {
    const afterChapter = chapter - 1;
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'outline', chapter });
    const span = { start: chapter, end: chapter };
    const volumeKey = await nearestVolumeKey(this.db, projectId, afterChapter);
    const neighbourRange = insert ? lte(schema.briefs.chapter, afterChapter + 1) : and(lte(schema.briefs.chapter, chapter + 1), ne(schema.briefs.chapter, chapter));
    const [pack, neighbours] = await Promise.all([
      this.contextAssembler.forOutline(projectId, chapter, { policy, span, volumeKey, ...(insert ? { insertAfter: afterChapter } : {}) }),
      this.db.query.briefs.findMany({
        where: and(eq(schema.briefs.projectId, projectId), gte(schema.briefs.chapter, afterChapter), neighbourRange),
        orderBy: asc(schema.briefs.chapter),
      }),
    ]);
    const [project, guard] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      loadRevealGuard(this.db, projectId, span, afterChapter),
    ]);

    const numbered = (brief: Generation.Brief): number => (insert && brief.chapter > afterChapter ? brief.chapter + 1 : brief.chapter);
    const surrounding = neighbours.map(brief => `## Chapter ${numbered(brief)}: ${brief.title ?? ''}\n${brief.body}`).join('\n\n');
    const heading = insert ? '## Surrounding chapters (as they will be numbered)' : '## Surrounding chapters';
    const catalog = [pack.rendered, surrounding && `${heading}\n${surrounding}`].filter(Boolean).join('\n\n');

    const wordTarget = resolveWordTarget(project);
    const prompt = buildOutlinePrompt(chapter, chapter, wordTarget, guard.advised);
    const ctx = { projectId, runId, promptKey: prompt.key, promptVersion: prompt.version, role: prompt.key };
    const vars = { catalog, volumePlan: '', startChapter: chapter, endChapter: chapter, extraContext, ...outlineWordTargetVars(wordTarget) };
    const raw = (await this.modelRouter.structured(prompt, vars, ctx, project as never, policy)) as OutlineOutput;
    const { briefs: outlined, sanitised } = sanitiseBriefReveals(raw, guard.all);
    if (sanitised.length > 0) this.logger.warn('plan: sanitised a brief that surfaced facts before their reveal chapter', { projectId, chapter, sanitised });

    const planned = outlined[0];
    if (!planned) throw AppErrorCode.BRF_001.create();
    const { kept, dropped } = await this.contextAssembler.sanitizeOutlinedRefs(projectId, planned.requiredContext ?? []);
    if (dropped.length > 0) this.logger.warn('plan: dropped context refs', { projectId, chapter, dropped });
    return { ...planned, contextRefs: kept, body: renderBriefBody({ ...planned, events: renderSceneEvents(planned.scenes) }) };
  }
}
