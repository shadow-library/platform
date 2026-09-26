import { and, eq, isNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import {
  learnedFactKeys,
  loadPlanState,
  lockProjectPlan,
  markDescendantDraftsStale,
  parseKnowledgeContract,
  planFrontier,
  planUnlockContext,
  reconcilePlanState,
  type UnlockContext,
} from '@server/common';
import { APP_NAME } from '@server/constants';
import { type FinalizeReview, type Job, type PrimaryDatabase, type PrimaryTransaction, type ProjectConfigData, schema } from '@server/database';

import { chapterProjectConfig } from '../ai/chapter-route';
import { continuityRoster } from '../ai/graphs/chapter-finalization.graph';
import { isolatedExtractionContext, standardReadableExtraction, WALLED_OFF_EXCERPT } from '../ai/isolation-read-policy';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type ContinuityOutput } from '../ai/schemas/continuity.schema';
import { GenerationService } from '../generation/generation.service';
import { JobExecutor } from '../jobs/job.executor';
import { hashReviewedBody } from '../review/review-findings';
import { dropBriefClaims, isReviewCurrent, loadChapterReviews, revealsStrandedByRevert, revertedMilestoneKeys, type ReviewWithItems } from './finalize-review-gate';
import { buildReviewItems, editedChange, type ProposedChange, sameProposal } from './finalize-review-items';
import { type BridgePosition, decidingBridges, readBridgeCandidates } from './isolation-bridge';
import { drizzleRowStore, revertAppliedItems } from './review-event-apply';

export interface FinalizeReviewItemView {
  id: bigint;
  category: FinalizeReview.Category;
  triage: FinalizeReview.Triage;
  basis: FinalizeReview.Basis;
  subjectKey: string;
  claim: string;
  evidence: string | null;
  proposed: ProposedChange;
  edited: ProposedChange | null;
  flag: FinalizeReview.Flag | null;
  dependents: string[] | null;
  decision: FinalizeReview.Decision | null;
  reason: string | null;
  autoKept: boolean;
  decidedAt: Date | null;
}

export interface FinalizeReviewView {
  id: bigint;
  chapter: number;
  draftRevision: number;
  status: FinalizeReview.Status;
  /** False once the prose moved past the approved revision: the review then no longer applies. */
  current: boolean;
  isolated: boolean;
  bridgeOnly: boolean;
  error: string | null;
  disclosure: { clear: boolean; findings: string[]; copy: string };
  open: { consequential: number; routine: number };
  consequential: FinalizeReviewItemView[];
  routine: FinalizeReviewItemView[];
  autoKeep: FinalizeReview.Category[];
  appliedAt: Date | null;
  /** The revision whose Story Bible updates stand applied, and can still be undone, whichever review is shown. */
  appliedRevision: number | null;
  revertedAt: Date | null;
}

export interface IsolationBridgeView {
  chapter: number;
  revision: number;
  /** False when nothing is approved against the current text: standard calls then read the chapter as walled off. */
  approved: boolean;
  summary: string | null;
  positions: BridgePosition[];
  droppedByHardLine: number;
  droppedOverLength: number;
}

export interface ItemDecisionRequest {
  decision: FinalizeReview.Decision;
  edited?: Record<string, unknown>;
  reason?: string;
}

interface PreparePayload {
  reviewId: string;
}

interface Draft {
  id: bigint;
  revision: number;
  body: string;
  isolated: boolean;
  status: string;
}

function presentItem(item: FinalizeReview.Item, redacted: boolean): FinalizeReviewItemView {
  const view: FinalizeReviewItemView = {
    id: item.id,
    category: item.category,
    triage: item.triage,
    basis: item.basis,
    subjectKey: item.subjectKey,
    claim: item.claim,
    evidence: item.evidence,
    proposed: item.proposed as ProposedChange,
    edited: (item.edited as ProposedChange | null) ?? null,
    flag: item.flag,
    dependents: item.dependents,
    decision: item.decision,
    reason: item.reason,
    autoKept: item.autoKept,
    decidedAt: item.decidedAt,
  };
  if (!redacted) return view;
  return {
    ...view,
    evidence: view.evidence === null ? null : WALLED_OFF_EXCERPT,
    proposed: standardReadableExtraction(view.proposed),
    edited: view.edited && standardReadableExtraction(view.edited),
  };
}

/** A bridge-only review never applies anything, so only a chapter's finalize reviews can hold applied updates. */
export function appliedRevision(reviews: readonly Pick<FinalizeReview.Row, 'bridgeOnly' | 'status' | 'draftRevision'>[]): number | null {
  return reviews.find(review => !review.bridgeOnly && review.status === 'applied')?.draftRevision ?? null;
}

/** Decision P4-39's rule for the finalize review: an isolated chapter's excerpts never leave it, whichever way isolation has moved since. */
export function presentFinalizeReview(
  review: ReviewWithItems,
  draft: Pick<Draft, 'revision' | 'body' | 'isolated'> | null,
  autoKeep: FinalizeReview.Category[],
  applied: number | null = null,
): FinalizeReviewView {
  const redacted = review.isolated || (draft?.isolated ?? false);
  const items = review.items.map(item => presentItem(item, redacted));
  const findings = items.filter(item => item.flag === 'unplanned_disclosure').map(item => item.claim);
  const clear = findings.length === 0;
  const count = (triage: FinalizeReview.Triage): number => items.filter(item => item.triage === triage && item.decision === null).length;
  return {
    id: review.id,
    chapter: review.chapter,
    draftRevision: review.draftRevision,
    status: review.status,
    current: draft !== null && isReviewCurrent(review, draft),
    isolated: redacted,
    bridgeOnly: review.bridgeOnly,
    error: review.error,
    disclosure: {
      clear,
      findings,
      copy: clear ? `No unplanned disclosure detected · revision ${review.draftRevision}` : `${findings.length} possible unplanned disclosure · revision ${review.draftRevision}`,
    },
    open: { consequential: count('consequential'), routine: count('routine') },
    consequential: items.filter(item => item.triage === 'consequential'),
    routine: items.filter(item => item.triage === 'routine'),
    autoKeep,
    appliedAt: review.appliedAt,
    appliedRevision: applied,
    revertedAt: review.revertedAt,
  };
}

/**
 * Review-before-finalize: on approval a job reads the Story Bible updates out of the exact approved revision; the author keeps, edits or skips
 * each (routine ones as a batch, or automatically per category); finalize then applies only the kept set, as one revertible unit.
 */
@Injectable()
export class FinalizeReviewService {
  private readonly logger = Logger.getLogger(APP_NAME, FinalizeReviewService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly jobExecutor: JobExecutor,
    private readonly generationService: GenerationService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  onModuleInit(): void {
    this.jobExecutor.registerHandler('finalize_review', job => this.runJob(job));
  }

  async get(projectId: bigint, chapter: number): Promise<FinalizeReviewView> {
    const [reviews, draft, autoKeep] = await Promise.all([loadChapterReviews(this.db, projectId, chapter), this.findDraft(this.db, projectId, chapter), this.autoKeep(projectId)]);
    const review = this.latest(reviews, draft);
    return presentFinalizeReview(review, draft, autoKeep, appliedRevision(reviews));
  }

  /** Enqueues the prepare job again for a review still preparing or one whose reading failed. */
  async prepare(projectId: bigint, chapter: number): Promise<FinalizeReviewView> {
    const reset = await this.db.transaction(async tx => {
      const draft = await this.findDraft(tx, projectId, chapter, true);
      await tx
        .select({ id: schema.finalizeReviews.id })
        .from(schema.finalizeReviews)
        .where(and(eq(schema.finalizeReviews.projectId, projectId), eq(schema.finalizeReviews.chapter, chapter)))
        .for('update');
      const review = this.latest(await loadChapterReviews(tx, projectId, chapter), draft);
      if (review.status === 'applied' || review.status === 'reverted') throw AppErrorCode.FRV_011.create();
      if (!draft || !isReviewCurrent(review, draft)) throw AppErrorCode.FRV_004.create();
      if (review.status !== 'preparing' && review.status !== 'failed') return null;
      await tx.update(schema.finalizeReviews).set({ status: 'preparing', error: null, updatedAt: new Date() }).where(eq(schema.finalizeReviews.id, review.id));
      return review.id;
    });
    if (reset !== null) await this.generationService.prepareFinalizeReview(projectId, chapter, reset);
    return this.get(projectId, chapter);
  }

  /** Exactly what a standard call reads of an isolated chapter now: the items approved against its current text, or nothing. */
  async bridge(projectId: bigint, chapter: number): Promise<IsolationBridgeView> {
    const draft = await this.findDraft(this.db, projectId, chapter);
    if (!draft) throw AppErrorCode.DRF_001.create();
    if (!draft.isolated) throw AppErrorCode.BRG_001.create({ chapter: String(chapter) });
    const bridge = decidingBridges(await readBridgeCandidates(this.db, projectId, [chapter])).get(chapter);
    const summary = bridge?.summary ?? null;
    const positions = bridge?.positions ?? [];
    return {
      chapter,
      revision: draft.revision,
      approved: summary !== null || positions.length > 0,
      summary,
      positions,
      droppedByHardLine: bridge?.droppedByHardLine ?? 0,
      droppedOverLength: bridge?.droppedOverLength ?? 0,
    };
  }

  /**
   * A final isolated chapter whose text changed (an amend) has no bridge until one is read from the new text: this stages a bridge-only review of
   * the current revision. An unfinished chapter's bridge is its finalize review, staged on approval.
   */
  async prepareBridge(projectId: bigint, chapter: number): Promise<FinalizeReviewView> {
    const staged = await this.db.transaction(async tx => {
      await lockProjectPlan(tx, projectId);
      const draft = await this.findDraft(tx, projectId, chapter, true);
      if (!draft) throw AppErrorCode.DRF_001.create();
      if (!draft.isolated) throw AppErrorCode.BRG_001.create({ chapter: String(chapter) });
      if (draft.status !== 'final') throw AppErrorCode.BRG_002.create({ chapter: String(chapter) });
      await tx
        .select({ id: schema.finalizeReviews.id })
        .from(schema.finalizeReviews)
        .where(and(eq(schema.finalizeReviews.projectId, projectId), eq(schema.finalizeReviews.chapter, chapter)))
        .for('update');
      const existing = (await loadChapterReviews(tx, projectId, chapter))
        .filter(review => review.bridgeOnly && review.draftRevision === draft.revision && isReviewCurrent(review, draft))
        .sort((left, right) => Number(right.id - left.id))[0];
      // A bridge already being read, or read and waiting for the author, is the one to answer; an applied or reverted review is never reused.
      if (existing?.status === 'preparing') return existing.id;
      if (existing?.status === 'ready') return null;
      const bound = { draftId: draft.id, sourceHash: hashReviewedBody(draft.body), planHash: null, isolated: true, bridgeOnly: true, status: 'preparing' as const, error: null };
      if (existing?.status === 'failed') {
        await tx
          .update(schema.finalizeReviews)
          .set({ ...bound, updatedAt: new Date() })
          .where(eq(schema.finalizeReviews.id, existing.id));
        return existing.id;
      }
      const [inserted] = await tx
        .insert(schema.finalizeReviews)
        .values({ projectId, chapter, draftRevision: draft.revision, ...bound })
        .returning({ id: schema.finalizeReviews.id });
      return inserted?.id ?? null;
    });
    if (staged !== null) {
      this.logger.info('isolation bridge staged for a final chapter', { projectId, chapter, reviewId: staged });
      await this.generationService.prepareFinalizeReview(projectId, chapter, staged);
    }
    return this.get(projectId, chapter);
  }

  async decide(projectId: bigint, chapter: number, itemId: bigint, request: ItemDecisionRequest): Promise<FinalizeReviewView> {
    const reason = request.reason?.trim() || null;
    if (request.decision === 'skipped' && !reason) throw AppErrorCode.FRV_010.create();
    await this.db.transaction(async tx => {
      const review = await this.lockOpenReview(tx, projectId, chapter);
      const item = review.items.find(candidate => candidate.id === itemId);
      if (!item) throw AppErrorCode.FRV_008.create();
      let edited: ProposedChange | null = null;
      if (request.decision === 'edited') {
        const outcome = editedChange(item.proposed as ProposedChange, request.edited ?? {});
        if ('refused' in outcome) throw AppErrorCode.FRV_009.create({ reason: outcome.refused });
        edited = outcome.change;
      }
      await tx
        .update(schema.finalizeReviewItems)
        .set({ decision: request.decision, edited: edited as never, reason, autoKept: false, decidedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.finalizeReviewItems.id, item.id));
    });
    this.logger.info('finalize review item decided', { projectId, chapter, itemId, decision: request.decision });
    return this.get(projectId, chapter);
  }

  async keepRoutine(projectId: bigint, chapter: number): Promise<FinalizeReviewView> {
    const kept = await this.db.transaction(async tx => {
      const review = await this.lockOpenReview(tx, projectId, chapter);
      return tx
        .update(schema.finalizeReviewItems)
        .set({ decision: 'kept', decidedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(schema.finalizeReviewItems.reviewId, review.id), eq(schema.finalizeReviewItems.triage, 'routine'), isNull(schema.finalizeReviewItems.decision)))
        .returning({ id: schema.finalizeReviewItems.id });
    });
    this.logger.info('finalize review routine items kept', { projectId, chapter, kept: kept.length });
    return this.get(projectId, chapter);
  }

  /** Stored beside the model overrides in `projects.config`, merged in place so neither setting overwrites the other. */
  async setAutoKeep(projectId: bigint, categories: FinalizeReview.Category[]): Promise<FinalizeReview.Category[]> {
    const autoKeep = [...new Set(categories)];
    const [row] = await this.db
      .update(schema.projects)
      .set({
        config: sql`coalesce(${schema.projects.config}, '{}'::jsonb) || jsonb_build_object('finalizeReview', jsonb_build_object('autoKeep', ${JSON.stringify(autoKeep)}::jsonb))`,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, projectId))
      .returning({ id: schema.projects.id });
    if (!row) throw AppErrorCode.PRJ_001.create();
    return autoKeep;
  }

  finalize(projectId: bigint, chapter: number): ReturnType<GenerationService['finalize']> {
    return this.generationService.finalize(projectId, { chapter });
  }

  /** Puts back every row the kept set changed, as one unit, under the plan lock finalize itself takes; only for the latest final chapter. */
  async revert(projectId: bigint, chapter: number): Promise<FinalizeReviewView> {
    await this.db.transaction(async tx => {
      await lockProjectPlan(tx, projectId);
      const [review] = await tx
        .select()
        .from(schema.finalizeReviews)
        .where(and(eq(schema.finalizeReviews.projectId, projectId), eq(schema.finalizeReviews.chapter, chapter), eq(schema.finalizeReviews.status, 'applied')))
        .for('update');
      // The frontier, not the story cursor: the cursor advances after finalize's commit, while a later chapter's `done` row lands inside it.
      if (!review || (await planFrontier(tx, projectId)) > chapter) throw AppErrorCode.FRV_012.create();
      const unreached = revertedMilestoneKeys(review.applied ?? []);
      const stranded = await revealsStrandedByRevert(tx, projectId, chapter, unreached);
      if (stranded) throw AppErrorCode.FRV_013.create({ milestone: stranded.milestone, facts: stranded.facts.join(', ') });
      await revertAppliedItems(drizzleRowStore(tx), review.applied ?? []);
      await dropBriefClaims(tx, projectId, chapter, unreached);
      await tx.update(schema.finalizeReviews).set({ status: 'reverted', revertedAt: new Date(), updatedAt: new Date() }).where(eq(schema.finalizeReviews.id, review.id));
      await markDescendantDraftsStale(tx, projectId, chapter, `the Story Bible updates of chapter ${chapter} were undone`);
      await reconcilePlanState(tx, projectId);
    });
    this.logger.info('finalize review reverted', { projectId, chapter });
    return this.get(projectId, chapter);
  }

  async runJob(job: Job.Row): Promise<void> {
    const { reviewId } = (job.payload ?? {}) as Partial<PreparePayload>;
    if (!reviewId) throw AppErrorCode.FRV_001.create();
    const review = await this.db.query.finalizeReviews.findFirst({ where: eq(schema.finalizeReviews.id, BigInt(reviewId)) });
    if (review?.status !== 'preparing' || !review.draftId) return;
    const draft = await this.db.query.drafts.findFirst({ where: eq(schema.drafts.id, review.draftId) });
    if (!draft || !isReviewCurrent(review, draft)) {
      this.logger.info('finalize review prepare skipped: the prose moved past the approved revision', { projectId: review.projectId, chapter: review.chapter, reviewId });
      return;
    }
    try {
      const items = await this.readItems(review, draft);
      await this.storeItems(review, items);
    } catch (err) {
      await this.db
        .update(schema.finalizeReviews)
        .set({ status: 'failed', error: (err instanceof Error ? err.message : String(err)).slice(0, 2000), updatedAt: new Date() })
        .where(and(eq(schema.finalizeReviews.id, review.id), eq(schema.finalizeReviews.status, 'preparing')));
      throw err;
    }
  }

  private async readItems(review: FinalizeReview.Row, draft: Draft): Promise<ReturnType<typeof buildReviewItems>> {
    const { projectId, chapter } = review;
    const [project, plan, milestones, entities, roster] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      loadPlanState(this.db, projectId),
      this.db.query.milestones.findMany({ columns: { milestoneKey: true, label: true, state: true }, where: eq(schema.milestones.projectId, projectId) }),
      this.db.query.entities.findMany({ columns: { entityKey: true }, where: eq(schema.entities.projectId, projectId) }),
      continuityRoster(this.db, projectId),
    ]);
    const brief = plan.plans.find(candidate => candidate.chapter === chapter);
    const claimed = brief?.claimedMilestones ?? [];
    const milestoneRoster = milestones.map(m => `${m.milestoneKey} (${m.state}${claimed.includes(m.milestoneKey) ? ', claimed by this chapter' : ''}): ${m.label}`).join('\n');
    const contextPack = `${roster}\n\n## MILESTONES\n${milestoneRoster || 'none'}`;

    const routed = chapterProjectConfig(project as ProjectConfig | undefined, review.isolated ? 'unrestricted' : 'standard');
    const ctx = { projectId, chapter, promptKey: PROMPT_REGISTRY.continuity.key, promptVersion: PROMPT_REGISTRY.continuity.version, role: 'continuity' };
    const extracted = (await this.modelRouter.structured(
      PROMPT_REGISTRY.continuity,
      { contextPack: review.isolated ? isolatedExtractionContext(contextPack) : contextPack, chapterNumber: chapter, chapterProse: draft.body },
      ctx,
      routed,
    )) as ContinuityOutput;

    const unlock: UnlockContext = brief
      ? planUnlockContext(brief, plan)
      : { chapter, endingChapter: null, volumeKey: null, volumeOrdinals: plan.volumeOrdinals, reachedMilestones: new Set() };
    const learns = parseKnowledgeContract(brief?.knowledgeContract)?.learns ?? [];
    return buildReviewItems({
      extraction: review.isolated ? standardReadableExtraction(extracted) : extracted,
      isolated: review.isolated,
      bridgeOnly: review.bridgeOnly,
      claimedMilestones: claimed,
      milestones,
      entityKeys: new Set(entities.map(entity => entity.entityKey)),
      plannedLearns: new Set(learns.map(reveal => `${reveal.entityKey}:${reveal.factKey}`)),
      plannedFactKeys: learnedFactKeys(brief?.knowledgeContract),
      facts: plan.facts,
      unlock,
      autoKeep: new Set((project?.config as ProjectConfigData | null)?.finalizeReview?.autoKeep ?? []),
    });
  }

  /**
   * The author's answers carry over by the record an item is about, so a skipped update is never asked again — not on a re-read of this revision
   * and not on the next revision's review. A keep or an edit carries over only within the revision and only onto the same proposed change.
   */
  private async storeItems(review: FinalizeReview.Row, items: ReturnType<typeof buildReviewItems>): Promise<void> {
    await this.db.transaction(async tx => {
      const [locked] = await tx.select().from(schema.finalizeReviews).where(eq(schema.finalizeReviews.id, review.id)).for('update');
      if (locked?.status !== 'preparing' || locked.sourceHash !== review.sourceHash || locked.planHash !== review.planHash) return;
      const chapterReviews = await loadChapterReviews(tx, review.projectId, review.chapter);
      const earlier = chapterReviews.filter(other => other.draftRevision < review.draftRevision).sort((left, right) => right.draftRevision - left.draftRevision)[0];
      const own = chapterReviews.find(other => other.id === review.id)?.items ?? [];
      const answered = new Map<string, FinalizeReview.Item>();
      // A bridge summary describes one text, so a skip of an earlier revision's summary says nothing about this one.
      for (const item of earlier?.items ?? []) if (item.decision === 'skipped' && item.category !== 'summary') answered.set(item.itemKey, item);
      for (const item of own) if (item.decision !== null && !item.autoKept) answered.set(item.itemKey, item);
      const carried = (item: (typeof items)[number]): FinalizeReview.Item | undefined => {
        const prior = answered.get(item.itemKey);
        return prior && (prior.decision === 'skipped' || sameProposal(prior.proposed, item.proposed)) ? prior : undefined;
      };
      await tx.delete(schema.finalizeReviewItems).where(eq(schema.finalizeReviewItems.reviewId, review.id));
      if (items.length > 0) {
        await tx.insert(schema.finalizeReviewItems).values(
          items.map((item, position) => {
            const prior = carried(item);
            return {
              reviewId: review.id,
              itemKey: item.itemKey,
              position,
              category: item.category,
              triage: item.triage,
              basis: item.basis,
              subjectKey: item.subjectKey,
              claim: item.claim,
              evidence: item.evidence,
              proposed: item.proposed as never,
              flag: item.flag,
              dependents: item.dependents,
              ...(prior
                ? { decision: prior.decision, reason: prior.reason, edited: prior.edited as never, autoKept: prior.autoKept, decidedAt: prior.decidedAt }
                : { decision: item.decision, autoKept: item.autoKept, decidedAt: item.decision ? new Date() : null }),
            };
          }),
        );
      }
      await tx.update(schema.finalizeReviews).set({ status: 'ready', error: null, updatedAt: new Date() }).where(eq(schema.finalizeReviews.id, review.id));
    });
    this.logger.info('finalize review prepared', { projectId: review.projectId, chapter: review.chapter, reviewId: review.id, items: items.length });
  }

  /** Locks in finalize's order — project plan, then the review — so a decision never lands on a review finalize is applying. */
  private async lockOpenReview(tx: PrimaryTransaction, projectId: bigint, chapter: number): Promise<ReviewWithItems> {
    await lockProjectPlan(tx, projectId);
    const draft = await this.findDraft(tx, projectId, chapter, true);
    await tx
      .select({ id: schema.finalizeReviews.id })
      .from(schema.finalizeReviews)
      .where(and(eq(schema.finalizeReviews.projectId, projectId), eq(schema.finalizeReviews.chapter, chapter)))
      .for('update');
    const review = this.latest(await loadChapterReviews(tx, projectId, chapter), draft);
    if (review.status === 'applied' || review.status === 'reverted') throw AppErrorCode.FRV_011.create();
    if (!draft || !isReviewCurrent(review, draft)) throw AppErrorCode.FRV_004.create();
    if (review.status === 'preparing') throw AppErrorCode.FRV_002.create();
    if (review.status === 'failed') throw AppErrorCode.FRV_003.create();
    return review;
  }

  private async findDraft(db: Pick<PrimaryDatabase, 'query' | 'select'>, projectId: bigint, chapter: number, lock = false): Promise<Draft | null> {
    const where = and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter));
    if (!lock) return (await db.query.drafts.findFirst({ columns: { id: true, revision: true, body: true, isolated: true, status: true }, where })) ?? null;
    const columns = { id: schema.drafts.id, revision: schema.drafts.revision, body: schema.drafts.body, isolated: schema.drafts.isolated, status: schema.drafts.status };
    const [draft] = await db.select(columns).from(schema.drafts).where(where).for('update');
    return draft ?? null;
  }

  /** The review of the revision on screen, else the newest one: a stale review is still shown, marked as no longer current. */
  private latest(reviews: readonly ReviewWithItems[], draft: Pick<Draft, 'revision'> | null): ReviewWithItems {
    const byRecency = [...reviews].sort((left, right) => right.draftRevision - left.draftRevision || Number(right.id - left.id));
    const current = draft ? byRecency.find(review => review.draftRevision === draft.revision) : undefined;
    const newest = byRecency[0];
    const review = current ?? newest;
    if (!review) throw AppErrorCode.FRV_001.create();
    return review;
  }

  private async autoKeep(projectId: bigint): Promise<FinalizeReview.Category[]> {
    const project = await this.db.query.projects.findFirst({ columns: { config: true }, where: eq(schema.projects.id, projectId) });
    return project?.config?.finalizeReview?.autoKeep ?? [];
  }
}
