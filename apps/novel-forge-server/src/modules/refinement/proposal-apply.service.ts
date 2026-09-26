import { and, desc, eq, gt, ne, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, type ErrorCode, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode, RevealRuleError } from '@server/classes';
import {
  assertMilestoneSubject,
  assertStartsNextChapter,
  auditCardSelection,
  autoActivateVolume,
  briefContentHash,
  changedCluesNamingTerms,
  computeBibleDocHash,
  enforcePlanWrite,
  findMilestoneReferences,
  lockProjectPlan,
  markDescendantDraftsStale,
  nearestVolumeKey,
  nextWritableChapter,
  normalizeStringList,
  planFrontier,
  refusedDraftWriteError,
  resetApprovalForPlanChange,
  revokeProvisionalReveals,
  volumeContentHash,
} from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type PrimaryTransaction, type Project, type Refinement, schema } from '@server/database';

import { defaultChapterMode } from '../ai/chapter-route';
import { runWithCostTier } from '../ai/cost-tier-scope';
import { isCostTier } from '../ai/defaults';
import { writingInstructionAdditions } from '../ai/prompts/writing-instructions';
import { hasOrganiseUndo, recordOrganiseDecision, revertOrganiseDecision, wholeOrganiseSelection } from '../notes/organise-record';
import { type ActionExecutionResult, type ActionExecutor, ActionExecutorRegistry } from './action-registry';
import { type ArtifactState, loadArtifactStates } from './artifact-state';
import { mergeBriefUpdate } from './brief-merge';
import { CHAT_TURN_GRAPH } from './chat-selection';
import {
  type ActionOp,
  type BibleDocumentRemoveOp,
  type BibleDocumentUpsertOp,
  type BriefRemoveOp,
  type BriefUpdateOp,
  type ChangeOp,
  changeSetRefs,
  type ContentOp,
  type DraftRemoveOp,
  type DraftUpdateOp,
  type EntityRemoveOp,
  type EntityUpsertOp,
  type FactRemoveOp,
  type FactUpsertOp,
  isActionOp,
  type MilestoneRemoveOp,
  type MilestoneUpsertOp,
  OP_METADATA_FIELDS,
  type PremiseUpdateOp,
  type VolumeRemoveOp,
  type VolumeUpsertOp,
} from './change-set';

export interface AppliedArtifact {
  artifactRef: string;
  newRevision: number | null;
  newSaveSeq?: number;
  newDraftId?: bigint;
}

export interface OpResult {
  index: number;
  status: 'applied' | 'declined' | 'pending' | 'failed';
  error?: string;
  /** Why the engine declined an op the author did not reject; only proposals applied before the quote rule carry one. */
  note?: string;
  result?: Record<string, unknown>;
}

export interface ApplyOptions {
  opIndexes?: number[];
  /** Set by a chat turn applying the author's own words; such an apply carries content ops only. */
  autoApplied?: boolean;
  /** Applies inside the caller's transaction, so the change commits or rolls back with the caller's own writes. Content ops only: actions run after a commit. */
  tx?: PrimaryTransaction;
}

export interface ApplyResult {
  proposal: Refinement.Proposal;
  applied: AppliedArtifact[];
  staleMarked: string[];
  opResults: OpResult[];
}

export interface RevertResult {
  proposal: Refinement.Proposal;
  reverted: AppliedArtifact[];
  staleMarked: string[];
}

export interface RollbackResult {
  reverted: { proposalId: bigint; artifacts: AppliedArtifact[] }[];
  skipped: bigint[];
  stoppedAt?: bigint;
  conflict?: Record<string, unknown>;
}

interface BaselineMismatch {
  artifactRef: string;
  expected: ArtifactState | undefined;
  actual: ArtifactState;
}

// Captured on the inverse and restored on revert, but deliberately absent from `OP_SPECS`: whether a human wrote the brief
// is the engine's to record, never a field a model or author change-set can set.
type BriefRestoreOp = BriefUpdateOp & { handEdited?: boolean };

// A removed milestone comes back with the chapter that reached it; its planned state is re-derived from the plans.
type MilestoneRestoreOp = MilestoneUpsertOp & { reachedChapter?: number | null; boundRevision?: number | null };

// The same for a removed draft's containment: reverting a removal must bring an isolated draft back isolated, whatever the op's author wrote.
type DraftRestoreOp = DraftUpdateOp & { isolated?: boolean; generator?: Project.ContentGenerator };

interface ApplyContext {
  tx: PrimaryDatabase;
  projectId: bigint;
  applied: AppliedArtifact[];
  staleMarked: string[];
}

type TxResult =
  | { outcome: 'applied'; proposal: Refinement.Proposal; applied: AppliedArtifact[]; staleMarked: string[]; opResults: OpResult[] }
  | { outcome: 'conflicted'; proposal: Refinement.Proposal };

/** A draft the proposal's own content ops rewrote is approved at the revision they wrote — the prose the author reviewed in the proposal. */
export function bindApprovalRevision(op: ActionOp, applied: readonly AppliedArtifact[]): ActionOp {
  if (op.op !== 'action.approve_draft') return op;
  const written = applied.find(artifact => artifact.artifactRef === `draft:${op.chapter}`);
  return typeof written?.newRevision === 'number' ? { ...op, revision: written.newRevision, saveSeq: written.newSaveSeq, draftId: written.newDraftId?.toString() } : op;
}

/**
 * The one-way doors: finalize locks prose, so it is not covered by the revert guarantee. A blanket apply refuses them, so the author must
 * select the op's own index to walk through the door.
 */
const ONE_WAY_DOORS: Partial<Record<ActionOp['op'], ErrorCode>> = {
  'action.finalize': AppErrorCode.RFN_009,
  'action.approve_draft': AppErrorCode.DRF_009,
  'action.generate_chapter': AppErrorCode.DRF_014,
  'action.advance_volume': AppErrorCode.VOL_004,
};

/**
 * A volume can be removed only once no brief names it, and a milestone only once no plan claims it and no fact's unlock names it; a
 * change-set may list the op that lets go of either after the removal, as may the inverse of one that listed the new record after the op
 * that took it up. Removals therefore run last, volumes then milestones, every other op in its listed order.
 */
export function removalsLast<T extends { op: string }>(ops: readonly T[]): T[] {
  const removal = (kind: string) => ops.filter(op => op.op === kind);
  return [...ops.filter(op => op.op !== 'volume.remove' && op.op !== 'milestone.remove'), ...removal('volume.remove'), ...removal('milestone.remove')];
}

const PLAN_STATE_OPS: ReadonlySet<string> = new Set([
  'brief.update',
  'brief.remove',
  'volume.upsert',
  'volume.remove',
  'fact.upsert',
  'fact.remove',
  'milestone.upsert',
  'milestone.remove',
]);

/** Plans, and the facts, volumes and milestones their reveal rule reads, are checked as the whole change-set leaves them, so one op may rely on another. */
async function enforcePlanOps(tx: PrimaryDatabase, projectId: bigint, ops: readonly ContentOp[]): Promise<void> {
  if (!ops.some(op => PLAN_STATE_OPS.has(op.op))) return;
  const written = ops.flatMap(op => (op.op === 'brief.update' ? [op.chapter] : []));
  await enforcePlanWrite(tx, projectId, written);
}

/** A plan pass plans only the next chapter, so its card goes out of date once a draft moves the story past the chapter it planned. */
async function assertPlanCardCurrent(tx: PrimaryDatabase, projectId: bigint, ops: readonly ContentOp[]): Promise<void> {
  const planned = ops.flatMap(op => (op.op === 'brief.update' ? [op.chapter] : []));
  if (planned.length === 0) return;
  const next = await nextWritableChapter(tx, projectId);
  const stale = planned.find(chapter => chapter !== next);
  if (stale !== undefined) throw AppErrorCode.PLN_008.create({ chapter: String(stale), next: String(next) });
}

/** The one gate between an op and the artifact it edits: its rationale and quote explain the change to the author and are never stored beside the content they describe. */
function withoutMetadata<T extends ChangeOp>(op: T): T {
  if (!OP_METADATA_FIELDS.some(field => field in op)) return op;
  const rest = { ...op } as Record<string, unknown>;
  for (const field of OP_METADATA_FIELDS) delete rest[field];
  return rest as T;
}

@Injectable()
export class ProposalApplyService {
  private readonly logger = Logger.getLogger(APP_NAME, ProposalApplyService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly actionRegistry: ActionExecutorRegistry,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Applies a pending proposal: lock, per-op selection (cherry-pick),
   * baseline conflict check over the selected refs, guarded op dispatch with inverse capture,
   * staleness propagation, audit. Content ops are transactional; selected actions execute after
   * commit, sequentially, with their outcomes folded into opResults. An automatic apply carries content ops only, and a blanket apply
   * refuses the one-way doors. On its own transaction, a
   * baseline mismatch commits only the `conflicted` status flip and surfaces as HTTP 409; any other
   * failure rolls the whole transaction back and leaves the proposal pending. With `options.tx`
   * everything runs inside the caller's transaction instead: the 409 is thrown with the flip still
   * uncommitted, so it persists only if the caller catches the error and commits anyway, and action
   * ops are refused because nothing has committed for them to run after.
   */
  async apply(projectId: bigint, proposalId: bigint, options?: ApplyOptions): Promise<ApplyResult> {
    this.logger.debug('apply: starting', { projectId, proposalId, opIndexes: options?.opIndexes, autoApplied: options?.autoApplied });
    const applyInTransaction = async (tx: PrimaryTransaction): Promise<TxResult> => {
      const [proposal] = await tx
        .select()
        .from(schema.refinementProposals)
        .where(and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)))
        .for('update');
      if (!proposal) throw AppErrorCode.RFN_001.create();
      if (proposal.status !== 'pending') throw AppErrorCode.RFN_002.create();

      const ops = proposal.changeSet as ChangeOp[];
      const auditSelection = proposal.kind === 'bible_audit' ? await auditCardSelection(tx, proposal.id, options?.opIndexes) : undefined;
      const organiseSelection = options?.opIndexes ? undefined : wholeOrganiseSelection(proposal);
      const selected = this.resolveSelection(ops, auditSelection ?? organiseSelection ?? options?.opIndexes);
      const selectedOps = selected.map(index => ({ index, op: ops[index] as ChangeOp }));
      const contentOps = selectedOps.filter((s): s is { index: number; op: ContentOp } => !isActionOp(s.op));
      const selectedActions = selectedOps.filter((s): s is { index: number; op: ActionOp } => isActionOp(s.op));

      if (options?.tx && selectedActions.length > 0) throw AppError.internal('action ops cannot run inside a caller transaction');

      if (options?.autoApplied && selectedActions.length > 0) throw AppError.internal('an automatic apply carries content ops only — actions are always the author’s selection');
      const door = options?.opIndexes ? undefined : selectedActions.map(action => ONE_WAY_DOORS[action.op.op]).find(code => code !== undefined);
      if (door) throw door.create();

      for (const action of selectedActions) {
        if (!this.actionRegistry.has(action.op.op)) throw AppErrorCode.RFN_008.create();
      }

      const baseline = proposal.baseline as Record<string, ArtifactState>;
      const mismatches = await this.findBaselineMismatches(
        tx as unknown as PrimaryDatabase,
        projectId,
        contentOps.map(c => c.op),
        baseline,
      );
      if (mismatches.length > 0) {
        this.logger.warn('apply: baseline conflict — artifact changed since the proposal was staged', {
          projectId,
          proposalId,
          conflictedRefs: mismatches.map(m => m.artifactRef),
        });
        const [conflicted] = await tx
          .update(schema.refinementProposals)
          .set({ status: 'conflicted', error: { mismatches }, updatedAt: new Date() })
          .where(eq(schema.refinementProposals.id, proposal.id))
          .returning();
        return { outcome: 'conflicted', proposal: conflicted ?? proposal };
      }

      const ctx: ApplyContext = { tx: tx as unknown as PrimaryDatabase, projectId, applied: [], staleMarked: [] };
      const inverseOps: ContentOp[] = [];
      const selectedContent = contentOps.map(entry => entry.op);
      if (selectedContent.some(op => PLAN_STATE_OPS.has(op.op))) await lockProjectPlan(tx, projectId);
      if (proposal.kind === 'chapter_plan') await assertPlanCardCurrent(ctx.tx, projectId, selectedContent);
      for (const op of removalsLast(selectedContent)) {
        const inverse = await this.captureInverse(ctx, op);
        await this.applyOp(ctx, op);
        if (inverse) inverseOps.unshift(inverse);
      }
      await enforcePlanOps(ctx.tx, projectId, selectedContent);
      const postState = await loadArtifactStates(ctx.tx, projectId, changeSetRefs(contentOps.map(c => c.op)));

      const opResults = this.opResultsFor(ops, selected);

      const [applied] = await tx
        .update(schema.refinementProposals)
        .set({
          status: 'applied',
          autoApplied: options?.autoApplied ?? false,
          opResults,
          inverseOps,
          postState,
          appliedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.refinementProposals.id, proposal.id))
        .returning();
      if (!applied) throw AppErrorCode.RFN_001.create();
      await recordOrganiseDecision(tx, projectId, proposal, selected);

      await tx
        .insert(schema.userFeedback)
        .values({ projectId, artifactType: 'refinement_proposal', artifactRef: String(proposal.id), disposition: 'approved', note: proposal.summary });
      const declined = opResults.filter(r => r.status === 'declined');
      if (declined.length > 0) {
        await tx.insert(schema.userFeedback).values({
          projectId,
          artifactType: 'refinement_proposal',
          artifactRef: String(proposal.id),
          disposition: 'rejected',
          note: `declined ops: ${declined.map(r => r.index).join(', ')}`,
        });
      }

      return { outcome: 'applied', proposal: applied, applied: ctx.applied, staleMarked: [...new Set(ctx.staleMarked)], opResults };
    };
    const result = options?.tx ? await applyInTransaction(options.tx) : await this.db.transaction(applyInTransaction);

    if (result.outcome === 'conflicted') throw AppErrorCode.RFN_003.create();

    const ops = result.proposal.changeSet as ChangeOp[];
    const pendingActions = result.opResults.filter(r => r.status === 'pending').map(r => ({ index: r.index, op: bindApprovalRevision(ops[r.index] as ActionOp, result.applied) }));
    const { opResults, proposal } = await this.executeActions(projectId, result.proposal, result.opResults, pendingActions);

    this.logger.info(`proposal ${proposalId} applied: ${result.applied.map(a => a.artifactRef).join(', ') || 'actions only'}`);
    return { proposal, applied: result.applied, staleMarked: result.staleMarked, opResults };
  }

  private opResultsFor(ops: ChangeOp[], selected: number[]): OpResult[] {
    return ops.map((op, index) => {
      if (!selected.includes(index)) return { index, status: 'declined' };
      return { index, status: isActionOp(op) ? 'pending' : 'applied' };
    });
  }

  /** Validates a cherry-pick selection (RFN_011) and resolves the effective op indexes, in op order. */
  private resolveSelection(ops: ChangeOp[], opIndexes?: number[]): number[] {
    if (!opIndexes) return ops.map((_, index) => index);
    const unique = [...new Set(opIndexes)].sort((a, b) => a - b);
    const valid = unique.length > 0 && unique.every(index => Number.isInteger(index) && index >= 0 && index < ops.length);
    if (!valid) throw AppErrorCode.RFN_011.create();
    return unique;
  }

  /**
   * Runs the selected actions after the content transaction committed (they enqueue jobs and run AI
   * chains — no DB transaction can span them). Sequential and fail-fast: a failed action records its
   * error and stops the rest; already-applied content stays applied.
   */
  private async executeActions(
    projectId: bigint,
    proposal: Refinement.Proposal,
    opResults: OpResult[],
    actions: { index: number; op: ActionOp }[],
  ): Promise<{ proposal: Refinement.Proposal; opResults: OpResult[] }> {
    if (actions.length === 0) return { proposal, opResults };

    const costTier = await this.turnCostTier(proposal);
    const results = [...opResults];
    let failed = false;
    for (const { index, op } of actions) {
      const entry = results.find(r => r.index === index) as OpResult;
      if (failed) {
        entry.status = 'failed';
        entry.error = 'skipped — a previous action failed';
        continue;
      }
      // Presence was verified pre-commit inside the transaction (RFN_008), so the lookup cannot miss.
      const executor = this.actionRegistry.get(op.op) as ActionExecutor;
      try {
        const execute = (): Promise<ActionExecutionResult> =>
          executor(projectId, op, { proposalId: proposal.id, opIndex: index, sessionId: proposal.sessionId, messageId: proposal.messageId });
        const outcome = await (costTier ? runWithCostTier(costTier, execute) : execute());
        entry.status = 'applied';
        entry.result = outcome as unknown as Record<string, unknown>;
      } catch (err) {
        failed = true;
        entry.status = 'failed';
        entry.error = err instanceof Error ? err.message : String(err);
        this.logger.error(`action ${op.op} failed for proposal ${proposal.id}`, { err });
      }
    }

    const [updated] = await this.db
      .update(schema.refinementProposals)
      .set({ opResults: results, error: failed ? { actionFailure: true } : null, updatedAt: new Date() })
      .where(eq(schema.refinementProposals.id, proposal.id))
      .returning();
    return { proposal: updated ?? proposal, opResults: results };
  }

  /**
   * The tier of the chat turn that staged the proposal, so the actions it proposed run at the tier the author chose for that turn — also
   * when the author applies them later. Anything else leaves the caller's scope, and failing that the project's tier, in charge.
   */
  private async turnCostTier(proposal: Refinement.Proposal): Promise<Project.CostTier | undefined> {
    if (!proposal.runId) return undefined;
    const [run] = await this.db
      .select({ costTier: sql<string | null>`${schema.workflowRuns.input}->>'costTier'` })
      .from(schema.workflowRuns)
      .where(and(eq(schema.workflowRuns.id, proposal.runId), eq(schema.workflowRuns.graph, CHAT_TURN_GRAPH)));
    return isCostTier(run?.costTier) ? run.costTier : undefined;
  }

  private async findBaselineMismatches(tx: PrimaryDatabase, projectId: bigint, ops: ChangeOp[], baseline: Record<string, ArtifactState>): Promise<BaselineMismatch[]> {
    const refs = changeSetRefs(ops);
    const current = await loadArtifactStates(tx, projectId, refs);

    const mismatches: BaselineMismatch[] = [];
    for (const ref of refs) {
      const expected = baseline[ref];
      const actual = current[ref] as ArtifactState;
      // A ref missing from the baseline means the change-set grew without re-capture — treat as conflict.
      if (!expected) {
        mismatches.push({ artifactRef: ref, expected, actual });
        continue;
      }
      const changed = expected.exists !== actual.exists || expected.revision !== actual.revision || expected.contentHash !== actual.contentHash;
      if (changed) mismatches.push({ artifactRef: ref, expected, actual });
    }
    return mismatches;
  }

  /**
   * Synthesizes the op that would undo `op`, from the row state as it stands right now — called
   * immediately before the op executes, inside the same transaction. Upserts
   * over existing rows invert to upserts of the prior refinable fields; creations invert to removes;
   * removes invert to upserts of the deleted content.
   */
  private captureInverse(ctx: ApplyContext, op: ContentOp): Promise<ContentOp | null> {
    switch (op.op) {
      case 'premise.update':
        return this.inversePremiseUpdate(ctx, op);
      case 'bible_document.upsert':
      case 'bible_document.remove':
        return this.inverseBibleDoc(ctx, op);
      case 'volume.upsert':
      case 'volume.remove':
        return this.inverseVolume(ctx, op);
      case 'brief.update':
      case 'brief.remove':
        return this.inverseBrief(ctx, op);
      case 'draft.update':
      case 'draft.remove':
        return this.inverseDraft(ctx, op);
      case 'entity.upsert':
      case 'entity.remove':
        return this.inverseEntity(ctx, op);
      case 'fact.upsert':
      case 'fact.remove':
        return this.inverseFact(ctx, op);
      case 'milestone.upsert':
      case 'milestone.remove':
        return this.inverseMilestone(ctx, op);
      case 'organise.rule':
        return Promise.resolve(null);
    }
  }

  private async inversePremiseUpdate(ctx: ApplyContext, op: PremiseUpdateOp): Promise<ContentOp | null> {
    const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
    if (!project) return null;
    const inverse: PremiseUpdateOp = { op: 'premise.update' };
    if (op.premise !== undefined) inverse.premise = project.premise ?? '';
    if (op.brief !== undefined) inverse.brief = project.brief ?? '';
    if (op.themes !== undefined) inverse.themes = (project.themes as string[] | null) ?? [];
    if (op.instructions !== undefined) inverse.instructions = project.instructions ?? '';
    return inverse;
  }

  private async inverseBibleDoc(ctx: ApplyContext, op: BibleDocumentUpsertOp | BibleDocumentRemoveOp): Promise<ContentOp | null> {
    const doc = await ctx.tx.query.bibleDocuments.findFirst({
      where: and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, op.section), eq(schema.bibleDocuments.slug, op.slug)),
    });
    if (!doc) return op.op === 'bible_document.upsert' ? { op: 'bible_document.remove', section: op.section, slug: op.slug } : null;
    return {
      op: 'bible_document.upsert',
      section: op.section,
      slug: op.slug,
      frontmatter: (doc.frontmatter as Record<string, unknown> | null) ?? undefined,
      body: doc.body ?? undefined,
    };
  }

  private async inverseVolume(ctx: ApplyContext, op: VolumeUpsertOp | VolumeRemoveOp): Promise<ContentOp | null> {
    const volume = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });
    if (!volume) return op.op === 'volume.upsert' ? { op: 'volume.remove', volumeKey: op.volumeKey } : null;
    return {
      op: 'volume.upsert',
      volumeKey: op.volumeKey,
      ordinal: volume.ordinal,
      title: volume.title ?? undefined,
      objective: volume.objective ?? undefined,
      body: volume.body ?? undefined,
    };
  }

  private async inverseBrief(ctx: ApplyContext, op: BriefUpdateOp | BriefRemoveOp): Promise<ContentOp | null> {
    const brief = await ctx.tx.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)) });
    if (!brief) return op.op === 'brief.update' ? { op: 'brief.remove', chapter: op.chapter } : null;
    const inverse: BriefRestoreOp = {
      op: 'brief.update',
      chapter: op.chapter,
      title: brief.title ?? undefined,
      body: brief.body,
      volumeKey: brief.volumeKey,
      writeMode: brief.writeMode,
      handEdited: brief.handEdited,
      contextRefs: (brief.contextRefs as string[] | null) ?? undefined,
      pov: brief.pov,
      chapterPurpose: brief.chapterPurpose ?? undefined,
      readerValue: (brief.readerValue as string[] | null) ?? undefined,
      repetitionRisks: brief.repetitionRisks,
      densityRisk: brief.densityRisk,
      endingContract: (brief.endingContract as BriefUpdateOp['endingContract'] | null) ?? undefined,
      // Always explicit: an omitted contract would merge as "keep", leaving a reverted reveal in place.
      knowledgeContract: (brief.knowledgeContract as BriefUpdateOp['knowledgeContract']) ?? null,
      direction: brief.direction,
      contentMode: brief.contentMode,
      scenes: brief.scenes,
      claimedMilestones: brief.claimedMilestones,
      isEnding: brief.isEnding,
    };
    return inverse;
  }

  private async inverseDraft(ctx: ApplyContext, op: DraftUpdateOp | DraftRemoveOp): Promise<ContentOp | null> {
    const draft = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
    if (!draft) return op.op === 'draft.update' ? { op: 'draft.remove', chapter: op.chapter } : null;
    const inverse: DraftRestoreOp = {
      op: 'draft.update',
      chapter: op.chapter,
      title: draft.title ?? undefined,
      body: draft.body,
      summary: draft.summary ?? undefined,
      isolated: draft.isolated,
      generator: draft.generator,
    };
    return inverse;
  }

  private async inverseEntity(ctx: ApplyContext, op: EntityUpsertOp | EntityRemoveOp): Promise<ContentOp | null> {
    const entity = await ctx.tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)) });
    if (!entity) return op.op === 'entity.upsert' ? { op: 'entity.remove', entityKey: op.entityKey } : null;
    return {
      op: 'entity.upsert',
      entityKey: op.entityKey,
      type: entity.type as EntityUpsertOp['type'],
      name: entity.name,
      status: entity.status ?? undefined,
      motivation: entity.motivation ?? undefined,
      notes: entity.notes ?? undefined,
      body: entity.body ?? undefined,
    };
  }

  private async inverseFact(ctx: ApplyContext, op: FactUpsertOp | FactRemoveOp): Promise<ContentOp | null> {
    const fact = await ctx.tx.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, ctx.projectId), eq(schema.canonFacts.factKey, op.factKey)) });
    if (!fact) return op.op === 'fact.upsert' ? { op: 'fact.remove', factKey: op.factKey } : null;
    return {
      op: 'fact.upsert',
      factKey: op.factKey,
      body: fact.text,
      subjects: (fact.subjects as string[] | null) ?? undefined,
      constraintNote: fact.constraintNote ?? undefined,
      writerNote: fact.writerNote ?? '',
      terms: (fact.terms as string[] | null) ?? undefined,
      // Always explicit: an omitted schedule would merge as "keep", leaving a reverted date in place.
      revealChapter: fact.revealChapter,
      unlock: fact.unlock,
      allowedClues: fact.allowedClues,
    };
  }

  private async inverseMilestone(ctx: ApplyContext, op: MilestoneUpsertOp | MilestoneRemoveOp): Promise<ContentOp | null> {
    const milestone = await ctx.tx.query.milestones.findFirst({
      where: and(eq(schema.milestones.projectId, ctx.projectId), eq(schema.milestones.milestoneKey, op.milestoneKey)),
    });
    if (!milestone) return op.op === 'milestone.upsert' ? { op: 'milestone.remove', milestoneKey: op.milestoneKey } : null;
    const inverse: MilestoneRestoreOp = {
      op: 'milestone.upsert',
      milestoneKey: op.milestoneKey,
      label: milestone.label,
      subjectEntityKey: milestone.subjectEntityKey,
      kind: milestone.kind,
      reachedChapter: milestone.reachedChapter,
      boundRevision: milestone.boundRevision,
    };
    return inverse;
  }

  private applyOp(ctx: ApplyContext, incoming: ChangeOp): Promise<void> {
    const op = withoutMetadata(incoming);
    switch (op.op) {
      case 'premise.update':
        return this.applyPremiseUpdate(ctx, op);
      case 'bible_document.upsert':
        return this.applyBibleDocUpsert(ctx, op);
      case 'bible_document.remove':
        return this.applyBibleDocRemove(ctx, op);
      case 'volume.upsert':
        return this.applyVolumeUpsert(ctx, op);
      case 'volume.remove':
        return this.applyVolumeRemove(ctx, op);
      case 'brief.update':
        return this.applyBriefUpdate(ctx, op);
      case 'brief.remove':
        return this.applyBriefRemove(ctx, op);
      case 'draft.update':
        return this.applyDraftUpdate(ctx, op);
      case 'draft.remove':
        return this.applyDraftRemove(ctx, op);
      case 'entity.upsert':
        return this.applyEntityUpsert(ctx, op);
      case 'entity.remove':
        return this.applyEntityRemove(ctx, op);
      case 'fact.upsert':
        return this.applyFactUpsert(ctx, op);
      case 'fact.remove':
        return this.applyFactRemove(ctx, op);
      case 'milestone.upsert':
        return this.applyMilestoneUpsert(ctx, op);
      case 'milestone.remove':
        return this.applyMilestoneRemove(ctx, op);
      case 'organise.rule':
        return Promise.resolve();
      default:
        // Actions never reach the content dispatcher — they are filtered out before apply and executed
        // post-commit. Reaching here is a programming error, not bad input.
        throw AppErrorCode.RFN_004.create();
    }
  }

  private async applyPremiseUpdate(ctx: ApplyContext, op: PremiseUpdateOp): Promise<void> {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (op.premise !== undefined) update['premise'] = op.premise;
    if (op.brief !== undefined) update['brief'] = op.brief;
    if (op.themes !== undefined) update['themes'] = op.themes;
    if (op.instructions !== undefined) update['instructions'] = writingInstructionAdditions(op.instructions);

    await ctx.tx.update(schema.projects).set(update).where(eq(schema.projects.id, ctx.projectId));
    ctx.applied.push({ artifactRef: 'premise', newRevision: null });
  }

  // Deliberately does not derive a title into frontmatter here: this op also replays as an inverse op
  // on revert/rollback, and that replay must restore the prior row's exact frontmatter, byte for byte.
  private async applyBibleDocUpsert(ctx: ApplyContext, op: BibleDocumentUpsertOp): Promise<void> {
    const contentHash = computeBibleDocHash(op.frontmatter, op.body);
    const [row] = await ctx.tx
      .insert(schema.bibleDocuments)
      .values({ projectId: ctx.projectId, section: op.section, slug: op.slug, frontmatter: op.frontmatter, body: op.body, contentHash, revision: 1 })
      .onConflictDoUpdate({
        target: [schema.bibleDocuments.projectId, schema.bibleDocuments.section, schema.bibleDocuments.slug],
        set: { frontmatter: op.frontmatter, body: op.body, contentHash, revision: sql`${schema.bibleDocuments.revision} + 1`, updatedAt: new Date() },
        setWhere: sql`${schema.bibleDocuments.contentHash} is distinct from ${contentHash}`,
      })
      .returning();

    // A canon change can affect any chapter — same invalidation as BibleDocumentService.upsert.
    if (row) await ctx.tx.update(schema.chapters).set({ needsRevalidation: true, updatedAt: new Date() }).where(eq(schema.chapters.projectId, ctx.projectId));

    const revision = row?.revision ?? (await this.currentDocRevision(ctx, op.section, op.slug));
    ctx.applied.push({ artifactRef: `doc:${op.section}/${op.slug}`, newRevision: revision });
  }

  private async currentDocRevision(ctx: ApplyContext, section: BibleDocumentUpsertOp['section'], slug: string): Promise<number | null> {
    const doc = await ctx.tx.query.bibleDocuments.findFirst({
      where: and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, section), eq(schema.bibleDocuments.slug, slug)),
    });
    return doc?.revision ?? null;
  }

  private async applyBibleDocRemove(ctx: ApplyContext, op: BibleDocumentRemoveOp): Promise<void> {
    const deleted = await ctx.tx
      .delete(schema.bibleDocuments)
      .where(and(eq(schema.bibleDocuments.projectId, ctx.projectId), eq(schema.bibleDocuments.section, op.section), eq(schema.bibleDocuments.slug, op.slug)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.DOC_001.create();

    await ctx.tx.update(schema.chapters).set({ needsRevalidation: true, updatedAt: new Date() }).where(eq(schema.chapters.projectId, ctx.projectId));
    ctx.applied.push({ artifactRef: `doc:${op.section}/${op.slug}`, newRevision: null });
  }

  private async applyVolumeUpsert(ctx: ApplyContext, op: VolumeUpsertOp): Promise<void> {
    const existing = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });

    const merged = {
      ordinal: op.ordinal ?? existing?.ordinal ?? 0,
      title: op.title ?? existing?.title ?? null,
      objective: op.objective ?? existing?.objective ?? null,
      body: op.body ?? existing?.body ?? null,
      // Never from `op`: state moves only through action.advance_volume, so an upsert keeps an existing volume's state and starts a new one not_started.
      state: existing?.state ?? 'not_started',
    };
    const contentHash = volumeContentHash({ volumeKey: op.volumeKey, ...merged });

    let revision: number;
    if (existing) {
      revision = existing.revision + 1;
      await ctx.tx
        .update(schema.volumes)
        .set({ ...merged, revision, contentHash, updatedAt: new Date() })
        .where(eq(schema.volumes.id, existing.id));
    } else {
      revision = 1;
      await ctx.tx.insert(schema.volumes).values({ projectId: ctx.projectId, volumeKey: op.volumeKey, ...merged, revision, contentHash });
      await autoActivateVolume(ctx.tx, ctx.projectId);
    }
    ctx.applied.push({ artifactRef: `volume:${op.volumeKey}`, newRevision: revision });
  }

  private async applyVolumeRemove(ctx: ApplyContext, op: VolumeRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, ctx.projectId), eq(schema.volumes.volumeKey, op.volumeKey)) });
    if (!existing) throw AppErrorCode.VOL_001.create();
    const planned = await ctx.tx.query.briefs.findFirst({
      where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.volumeKey, op.volumeKey)),
      columns: { chapter: true },
    });
    if (planned) throw AppErrorCode.VOL_002.create({ chapter: String(planned.chapter) });

    await ctx.tx.delete(schema.volumes).where(eq(schema.volumes.id, existing.id));
    ctx.applied.push({ artifactRef: `volume:${op.volumeKey}`, newRevision: null });
  }

  /** A plan at or behind the story cursor or the latest finalized chapter is part of canon's history. */
  private async assertPlanOpen(ctx: ApplyContext, chapter: number): Promise<void> {
    const project = await ctx.tx.query.projects.findFirst({ columns: { id: true }, where: eq(schema.projects.id, ctx.projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (chapter <= (await planFrontier(ctx.tx, ctx.projectId))) throw AppErrorCode.RFN_005.create();
  }

  private async applyBriefUpdate(ctx: ApplyContext, op: BriefRestoreOp): Promise<void> {
    await this.assertPlanOpen(ctx, op.chapter);

    const existing = await ctx.tx.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)) });

    // A missing brief is creatable — refinement is a first-class authoring path — but only with a body;
    // without one there is nothing for the chapter author to draft from.
    if (!existing && op.body === undefined) throw AppErrorCode.RFN_004.create();

    const creates = (field: unknown): boolean => !existing && field === undefined;
    const defaults = {
      volumeKey: creates(op.volumeKey) ? await nearestVolumeKey(ctx.tx, ctx.projectId, op.chapter) : null,
      contentMode: creates(op.contentMode) ? await defaultChapterMode(ctx.tx, ctx.projectId) : null,
    };
    const merged = mergeBriefUpdate(existing, op, defaults);
    const contentHash = briefContentHash({ ...existing, chapter: op.chapter, ...merged });
    const revision = (existing?.revision ?? 0) + 1;

    if (existing) {
      await ctx.tx
        .update(schema.briefs)
        .set({ ...merged, revision, contentHash, staleReason: null, handEdited: op.handEdited ?? true, updatedAt: new Date() })
        .where(eq(schema.briefs.id, existing.id));
    } else {
      await ctx.tx.insert(schema.briefs).values({ projectId: ctx.projectId, chapter: op.chapter, ...merged, revision, contentHash, handEdited: op.handEdited ?? true });
    }
    await resetApprovalForPlanChange(ctx.tx, ctx.projectId, op.chapter, existing, merged);
    ctx.applied.push({ artifactRef: `chapter:${op.chapter}`, newRevision: revision });
  }

  private async applyBriefRemove(ctx: ApplyContext, op: BriefRemoveOp): Promise<void> {
    await this.assertPlanOpen(ctx, op.chapter);

    const deleted = await ctx.tx
      .delete(schema.briefs)
      .where(and(eq(schema.briefs.projectId, ctx.projectId), eq(schema.briefs.chapter, op.chapter)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.RFN_004.create();
    await resetApprovalForPlanChange(ctx.tx, ctx.projectId, op.chapter, deleted[0], {});
    ctx.applied.push({ artifactRef: `chapter:${op.chapter}`, newRevision: null });
  }

  /**
   * Draft prose is chat-editable only while it is still a draft (chat-hub design decision 2): a final
   * draft or a chapter at/behind the story cursor is locked canon. Every edit lands as a
   * draft_revisions row (source chat_edited), so prose history survives independent of proposal revert.
   */
  private async applyDraftUpdate(ctx: ApplyContext, op: DraftRestoreOp): Promise<void> {
    const project = await ctx.tx.query.projects.findFirst({ where: eq(schema.projects.id, ctx.projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    if (op.chapter <= (project.storyCurrentChapter ?? 0)) throw AppErrorCode.RFN_010.create();

    const existing = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
    if (existing?.status === 'final') throw AppErrorCode.RFN_010.create();
    if (!existing && op.body === undefined) throw AppErrorCode.RFN_004.create();
    if (existing?.isolated && op.body !== undefined && op.body !== existing.body) throw AppErrorCode.RFN_012.create();

    const merged = { title: op.title ?? existing?.title ?? null, body: op.body ?? existing?.body ?? '', summary: op.summary ?? existing?.summary ?? null };

    let written: { id: bigint; revision: number; saveSeq: number } | undefined;
    if (existing) {
      [written] = await ctx.tx
        .update(schema.drafts)
        .set({ ...merged, revision: sql`${schema.drafts.revision} + 1`, reviewStatus: 'needs_review', staleReason: null, updatedAt: new Date() })
        .where(
          and(eq(schema.drafts.id, existing.id), eq(schema.drafts.revision, existing.revision), eq(schema.drafts.saveSeq, existing.saveSeq), ne(schema.drafts.status, 'final')),
        )
        .returning({ id: schema.drafts.id, revision: schema.drafts.revision, saveSeq: schema.drafts.saveSeq });
      if (!written) throw await refusedDraftWriteError(ctx.tx, ctx.projectId, op.chapter);
    } else {
      await assertStartsNextChapter(ctx.tx, ctx.projectId, op.chapter);
      [written] = await ctx.tx
        .insert(schema.drafts)
        .values({
          projectId: ctx.projectId,
          chapter: op.chapter,
          ...merged,
          status: 'draft',
          revision: 1,
          reviewStatus: 'needs_review',
          generator: op.generator ?? 'standard',
          isolated: op.isolated ?? false,
        })
        .returning({ id: schema.drafts.id, revision: schema.drafts.revision, saveSeq: schema.drafts.saveSeq });
      if (!written) throw AppErrorCode.DRF_001.create();
    }

    await ctx.tx
      .insert(schema.draftRevisions)
      .values({ projectId: ctx.projectId, draftId: written.id, revision: written.revision, source: 'chat_edited', body: merged.body, summary: merged.summary })
      .onConflictDoNothing();
    await markDescendantDraftsStale(ctx.tx, ctx.projectId, op.chapter, `ancestor chapter ${op.chapter} was chat_edited`);
    if (existing) await revokeProvisionalReveals(ctx.tx, ctx.projectId, op.chapter);
    ctx.applied.push({ artifactRef: `draft:${op.chapter}`, newRevision: written.revision, newSaveSeq: written.saveSeq, newDraftId: written.id });
  }

  private async applyDraftRemove(ctx: ApplyContext, op: DraftRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, ctx.projectId), eq(schema.drafts.chapter, op.chapter)) });
    if (!existing) throw AppErrorCode.DRF_001.create();
    if (existing.status === 'final') throw AppErrorCode.RFN_010.create();

    const removed = await ctx.tx
      .delete(schema.drafts)
      .where(and(eq(schema.drafts.id, existing.id), ne(schema.drafts.status, 'final')))
      .returning({ id: schema.drafts.id });
    if (removed.length === 0) throw await refusedDraftWriteError(ctx.tx, ctx.projectId, op.chapter);
    await markDescendantDraftsStale(ctx.tx, ctx.projectId, op.chapter, `ancestor chapter ${op.chapter} was removed`);
    await revokeProvisionalReveals(ctx.tx, ctx.projectId, op.chapter);
    ctx.applied.push({ artifactRef: `draft:${op.chapter}`, newRevision: null });
  }

  private async applyEntityUpsert(ctx: ApplyContext, op: EntityUpsertOp): Promise<void> {
    const existing = await ctx.tx.query.entities.findFirst({ where: and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)) });
    if (!existing && !op.name) throw AppErrorCode.RFN_004.create();

    const merged = {
      type: op.type,
      name: op.name ?? existing?.name ?? op.entityKey,
      status: op.status ?? existing?.status ?? null,
      motivation: op.motivation ?? existing?.motivation ?? null,
      notes: op.notes ?? existing?.notes ?? null,
      body: op.body ?? existing?.body ?? null,
    };

    if (existing) {
      await ctx.tx
        .update(schema.entities)
        .set({ ...merged, updatedAt: new Date() })
        .where(eq(schema.entities.id, existing.id));
    } else {
      await ctx.tx.insert(schema.entities).values({ projectId: ctx.projectId, entityKey: op.entityKey, ...merged, origin: 'generated' });
    }
    ctx.applied.push({ artifactRef: `entity:${op.entityKey}`, newRevision: null });
  }

  private async applyEntityRemove(ctx: ApplyContext, op: EntityRemoveOp): Promise<void> {
    const deleted = await ctx.tx
      .delete(schema.entities)
      .where(and(eq(schema.entities.projectId, ctx.projectId), eq(schema.entities.entityKey, op.entityKey)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.RFN_004.create();
    ctx.applied.push({ artifactRef: `entity:${op.entityKey}`, newRevision: null });
  }

  /** Mirrors FactService.upsert's field merge on the apply transaction — reveals stay out of the grammar. */
  private async applyFactUpsert(ctx: ApplyContext, op: FactUpsertOp): Promise<void> {
    const existing = await ctx.tx.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, ctx.projectId), eq(schema.canonFacts.factKey, op.factKey)) });
    if (!existing && op.body === undefined) throw AppErrorCode.RFN_004.create();

    const merged = {
      text: op.body ?? existing?.text ?? '',
      subjects: (op.subjects ?? existing?.subjects ?? null) as never,
      constraintNote: op.constraintNote ?? existing?.constraintNote ?? null,
      writerNote: op.writerNote === undefined ? (existing?.writerNote ?? null) : op.writerNote.trim() || null,
      terms: (op.terms ?? existing?.terms ?? null) as never,
      revealChapter: op.revealChapter === undefined ? (existing?.revealChapter ?? null) : op.revealChapter,
      unlock: op.unlock === undefined ? (existing?.unlock ?? null) : op.unlock,
      allowedClues: op.allowedClues === undefined ? (existing?.allowedClues ?? null) : op.allowedClues && normalizeStringList(op.allowedClues),
    };
    const giveaways = changedCluesNamingTerms(existing, merged);
    if (giveaways.length > 0) throw AppErrorCode.FCT_006.create({ reason: giveaways.join('; ') });

    if (existing) {
      await ctx.tx
        .update(schema.canonFacts)
        .set({ ...merged, updatedAt: new Date() })
        .where(eq(schema.canonFacts.id, existing.id));
    } else {
      await ctx.tx.insert(schema.canonFacts).values({ projectId: ctx.projectId, factKey: op.factKey, ...merged });
    }
    ctx.applied.push({ artifactRef: `fact:${op.factKey}`, newRevision: null });
  }

  /**
   * Deleting a fact cascades its knowledge ledger, and the inverse op restores only the fact row — so
   * a ledgered fact is refused rather than silently breaking the revert guarantee.
   * Retract the reveals first through the fact endpoints.
   */
  private async applyFactRemove(ctx: ApplyContext, op: FactRemoveOp): Promise<void> {
    const existing = await ctx.tx.query.canonFacts.findFirst({ where: and(eq(schema.canonFacts.projectId, ctx.projectId), eq(schema.canonFacts.factKey, op.factKey)) });
    if (!existing) throw AppErrorCode.FCT_001.create();

    const ledgered = await ctx.tx.query.characterKnowledge.findFirst({ where: eq(schema.characterKnowledge.factId, existing.id) });
    if (ledgered) throw AppErrorCode.FCT_003.create();

    await ctx.tx.delete(schema.canonFacts).where(eq(schema.canonFacts.id, existing.id));
    ctx.applied.push({ artifactRef: `fact:${op.factKey}`, newRevision: null });
  }

  private async applyMilestoneUpsert(ctx: ApplyContext, op: MilestoneRestoreOp): Promise<void> {
    const existing = await ctx.tx.query.milestones.findFirst({
      where: and(eq(schema.milestones.projectId, ctx.projectId), eq(schema.milestones.milestoneKey, op.milestoneKey)),
    });
    if (!existing && !op.label?.trim()) throw AppErrorCode.RFN_004.create();
    const restoring = 'reachedChapter' in op;
    if (!restoring && op.subjectEntityKey?.trim() && op.subjectEntityKey.trim() !== existing?.subjectEntityKey)
      await assertMilestoneSubject(ctx.tx, ctx.projectId, op.subjectEntityKey.trim());

    const merged = {
      label: op.label?.trim() || existing?.label || op.milestoneKey,
      subjectEntityKey: op.subjectEntityKey === undefined ? (existing?.subjectEntityKey ?? null) : op.subjectEntityKey?.trim() || null,
      kind: op.kind ?? existing?.kind ?? 'custom',
    };
    if (existing) {
      await ctx.tx
        .update(schema.milestones)
        .set({ ...merged, updatedAt: new Date() })
        .where(eq(schema.milestones.id, existing.id));
    } else {
      const reached =
        typeof op.reachedChapter === 'number'
          ? { state: 'reached' as const, plannedChapter: op.reachedChapter, reachedChapter: op.reachedChapter, boundRevision: op.boundRevision ?? null }
          : {};
      await ctx.tx.insert(schema.milestones).values({ projectId: ctx.projectId, milestoneKey: op.milestoneKey, ...merged, ...reached });
    }
    ctx.applied.push({ artifactRef: `milestone:${op.milestoneKey}`, newRevision: null });
  }

  private async applyMilestoneRemove(ctx: ApplyContext, op: MilestoneRemoveOp): Promise<void> {
    const references = await findMilestoneReferences(ctx.tx, ctx.projectId, op.milestoneKey);
    if (references.length > 0) throw AppErrorCode.MIL_003.create({ milestoneKey: op.milestoneKey, references: references.join(', ') });
    const deleted = await ctx.tx
      .delete(schema.milestones)
      .where(and(eq(schema.milestones.projectId, ctx.projectId), eq(schema.milestones.milestoneKey, op.milestoneKey)))
      .returning();
    if (deleted.length === 0) throw AppErrorCode.MIL_001.create();
    ctx.applied.push({ artifactRef: `milestone:${op.milestoneKey}`, newRevision: null });
  }

  /**
   * Undoes an applied proposal by executing its stored inverse ops through the same appliers —
   * same hashing, revision bumps, and staleness propagation as any apply. Guarded
   * strictly: every artifact must still be exactly as the apply left it (postState); anything moved
   * on → 409 RFN_006, nothing touched. Revisions only ever move forward — a revert bumps them again
   * with the restored content, so later baselines stay coherent.
   */
  async revert(projectId: bigint, proposalId: bigint): Promise<RevertResult> {
    this.logger.debug('revert: starting', { projectId, proposalId });
    const result = await this.db.transaction(async tx => {
      const [proposal] = await tx
        .select()
        .from(schema.refinementProposals)
        .where(and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)))
        .for('update');
      if (!proposal) throw AppErrorCode.RFN_001.create();
      const inverseOps = (proposal.inverseOps ?? []) as ContentOp[];
      if (proposal.status !== 'applied' || (inverseOps.length === 0 && !hasOrganiseUndo(proposal))) throw AppErrorCode.RFN_007.create();

      // Content identity (exists + contentHash) is the guard — NOT revision: reverting a newer change
      // on the same artifact restores this proposal's content but bumps the revision counter, and a
      // rollback chain must keep walking backward through exactly that state.
      const postState = (proposal.postState ?? {}) as Record<string, ArtifactState>;
      const refs = Object.keys(postState);
      const current = await loadArtifactStates(tx as unknown as PrimaryDatabase, projectId, refs);
      const mismatches: BaselineMismatch[] = [];
      for (const ref of refs) {
        const expected = postState[ref] as ArtifactState;
        const actual = current[ref] as ArtifactState;
        const changed = expected.exists !== actual.exists || expected.contentHash !== actual.contentHash;
        if (changed) mismatches.push({ artifactRef: ref, expected, actual });
      }
      if (mismatches.length > 0) return { outcome: 'conflicted' as const, mismatches };

      const ctx: ApplyContext = { tx: tx as unknown as PrimaryDatabase, projectId, applied: [], staleMarked: [] };
      if (inverseOps.some(op => PLAN_STATE_OPS.has(op.op))) await lockProjectPlan(tx, projectId);
      for (const op of removalsLast(inverseOps)) await this.applyOp(ctx, op);
      await enforcePlanOps(ctx.tx, projectId, inverseOps);
      await revertOrganiseDecision(tx, projectId, proposal);

      const [reverted] = await tx
        .update(schema.refinementProposals)
        .set({ status: 'reverted', revertedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.refinementProposals.id, proposal.id))
        .returning();
      if (!reverted) throw AppErrorCode.RFN_001.create();

      await tx.insert(schema.userFeedback).values({ projectId, artifactType: 'refinement_proposal', artifactRef: String(proposal.id), disposition: 'rejected', note: 'reverted' });

      return { outcome: 'reverted' as const, proposal: reverted, reverted: ctx.applied, staleMarked: [...new Set(ctx.staleMarked)] };
    });

    if (result.outcome === 'conflicted') throw AppErrorCode.RFN_006.create();
    this.logger.info(`proposal ${proposalId} reverted: ${result.reverted.map(a => a.artifactRef).join(', ')}`);
    return { proposal: result.proposal, reverted: result.reverted, staleMarked: result.staleMarked };
  }

  /**
   * Rolls the project back to the state right after `afterProposalId` was applied: every applied
   * proposal newer than the anchor is reverted, newest first, each in its own transaction. Action-only
   * proposals (nothing to invert) are skipped. Stops at the first conflict and reports how far it got.
   * Cross-session changes are included by design — the history is project-wide.
   */
  async rollbackAfter(projectId: bigint, afterProposalId: bigint): Promise<RollbackResult> {
    const anchor = await this.db.query.refinementProposals.findFirst({
      where: and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, afterProposalId)),
    });
    if (!anchor) throw AppErrorCode.RFN_001.create();
    if (!anchor.appliedAt) throw AppErrorCode.RFN_007.create();

    // The anchor's appliedAt stays in SQL — round-tripping it through a JS Date shifts timestamps
    // (timezone serialization) and corrupts the comparison. Ties on the same instant break by id.
    // Raw identifiers on purpose: drizzle column refs would leak the outer query's alias into the subquery.
    const anchorAppliedAt = sql`(select applied_at from refinement_proposals where id = ${afterProposalId})`;
    const newer = await this.db.query.refinementProposals.findMany({
      where: and(
        eq(schema.refinementProposals.projectId, projectId),
        eq(schema.refinementProposals.status, 'applied'),
        or(
          gt(schema.refinementProposals.appliedAt, anchorAppliedAt),
          and(eq(schema.refinementProposals.appliedAt, anchorAppliedAt), gt(schema.refinementProposals.id, afterProposalId)),
        ),
      ),
      orderBy: [desc(schema.refinementProposals.appliedAt), desc(schema.refinementProposals.id)],
    });

    const result: RollbackResult = { reverted: [], skipped: [] };
    for (const proposal of newer) {
      const inverseOps = (proposal.inverseOps ?? []) as ContentOp[];
      if (inverseOps.length === 0 && !hasOrganiseUndo(proposal)) {
        result.skipped.push(proposal.id);
        continue;
      }
      try {
        const reverted = await this.revert(projectId, proposal.id);
        result.reverted.push({ proposalId: proposal.id, artifacts: reverted.reverted });
      } catch (err) {
        result.stoppedAt = proposal.id;
        if (err instanceof RevealRuleError) result.conflict = { code: err.code, message: err.message, details: { violations: err.violations } };
        else if (AppError.is(err)) result.conflict = { code: err.code, message: err.message };
        else result.conflict = { message: err instanceof Error ? err.message : String(err) };
        break;
      }
    }
    return result;
  }
}
