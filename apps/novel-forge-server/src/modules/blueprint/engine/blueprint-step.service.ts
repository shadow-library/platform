import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Blueprint, type DbExecutor, type Ledger, type PrimaryDatabase, type PrimaryTransaction, type Project, type Refinement, schema } from '@server/database';

import { ActionExecutorRegistry } from '../../refinement/action-registry';
import { type ActionOp, type ActionType, CONTENT_OP_TYPES, type OpType } from '../../refinement/change-set';
import { ProposalService } from '../../refinement/proposal.service';
import { ProposalApplyService } from '../../refinement/proposal-apply.service';
import { loadActiveLedger } from '../ledger/ledger-entries';
import { LedgerService } from '../ledger/ledger.service';
import { type NewLedgerEntry, type SupersedingEntry } from '../ledger/ledger.types';
import {
  assertOfferedOptions,
  describeView,
  generatorKeyOf,
  isActiveRound,
  lockedSliceMoved,
  reconcileLockEntries,
  resolveNudges,
  roundLedgerEffects,
  sliceDigest,
  stampLockedSlice,
  validateStepPart,
  viewOf,
} from './blueprint-round';
import { BlueprintRoundService, presentRound, type RoundWithJob } from './blueprint-round.service';
import { BlueprintStepRegistry } from './blueprint-step.registry';
import { type AnyBlueprintStep, type AnyGeneratingStep, type AnyLockingStep, isSourced, type LockPlan, type RoundAuthorInput, type StepOption } from './blueprint-step.types';

export const RELOCK_WITHDRAW_REASON = 'Replaced when the step was locked again.';

/** A lock materialises plan content; drafts and the retired seed sheet are never Blueprint output, and actions belong after the commit. */
export const BLUEPRINT_CHANGE_OPS: readonly OpType[] = CONTENT_OP_TYPES.filter(op => !op.startsWith('draft.') && op !== 'seed.update');

/**
 * The only actions a lock may run after its commit — the counterpart of `BLUEPRINT_CHANGE_OPS`, and deliberately short. Both approvals
 * are on the pipeline's never-auto-applied list precisely because they must be somebody's decision; a Blueprint lock IS that decision,
 * made on content the same lock just wrote. Nothing that generates, writes or spends a model call belongs here: a lock is not a job,
 * and re-locking is the only retry, so every op listed has to be safe to run again.
 */
export const BLUEPRINT_ACTION_OPS: readonly ActionType[] = ['action.approve_volume_plan', 'action.approve_arcs'];

export interface OpenRoundInput {
  steer?: string;
  nudges?: string[];
  keepAsDirection?: boolean;
  feedback?: Blueprint.OptionFeedback[];
  input?: unknown;
}

export interface StepState {
  step: AnyBlueprintStep;
  /** The latest round of the step's generator, with its options narrowed to what this step shows. */
  latestRound: Blueprint.Round | null;
  /** The screen is locked, and a later whole-pass rerun has moved the part it was locked from. */
  sliceMoved: boolean;
}

export type LockFollowUp = { ok: true } | { ok: false; error: string };

export interface LockResult {
  entries: Ledger.Entry[];
  withdrawn: Ledger.Entry[];
  proposal: Refinement.Proposal | null;
  followUp: LockFollowUp | null;
}

interface CommittedLock extends Omit<LockResult, 'followUp'> {
  plan: LockPlan;
}

export async function loadBlueprintProject(executor: Pick<DbExecutor, 'query'>, projectId: bigint): Promise<Project.Row> {
  const project = await executor.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
  if (!project) throw AppErrorCode.PRJ_001.create();
  if (project.kind !== 'new_novel') throw AppErrorCode.BPR_003.create();
  return project;
}

function successorOf(entry: NewLedgerEntry): SupersedingEntry {
  const { kind, statement, why, rejectedAlternatives, writerLine, decidedBy, stepKey, payload, links } = entry;
  return { kind, statement, why, rejectedAlternatives, writerLine, decidedBy, stepKey, payload, links };
}

function authorInput(addressed: AnyBlueprintStep, generator: AnyGeneratingStep, focus: string | null, input: OpenRoundInput): RoundAuthorInput {
  if (input.input !== undefined && !generator.inputSchema) throw AppErrorCode.BPR_004.create({ part: 'input', issues: 'this step takes no input' });
  return {
    steer: input.steer?.trim() || null,
    nudges: resolveNudges(addressed, input.nudges ?? []),
    keepAsDirection: input.keepAsDirection ?? false,
    feedback: input.feedback ?? [],
    input: generator.inputSchema && input.input !== undefined ? validateStepPart(generator.inputSchema, input.input, 'input') : null,
    focus,
  };
}

function viewRound(step: AnyBlueprintStep, round: Blueprint.Round): Blueprint.Round {
  return round.options === null ? round : { ...round, options: viewOf(step, round.options) };
}

/** A pass round focused on another screen reworks that screen's part alone, so this screen's answer cannot move under it while it locks. */
function runsBeside(step: AnyLockingStep, round: Blueprint.Round): boolean {
  return round.focus !== null && round.focus !== step.key;
}

@Injectable()
export class BlueprintStepService {
  private readonly logger = Logger.getLogger(APP_NAME, BlueprintStepService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly rounds: BlueprintRoundService,
    private readonly registry: BlueprintStepRegistry,
    private readonly ledger: LedgerService,
    private readonly proposals: ProposalService,
    private readonly proposalApply: ProposalApplyService,
    private readonly actions: ActionExecutorRegistry,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async state(projectId: bigint): Promise<StepState[]> {
    await loadBlueprintProject(this.db, projectId);
    const [rounds, ledger] = await Promise.all([this.rounds.latestPerStep(projectId), loadActiveLedger(this.db, projectId)]);
    const latest = new Map(rounds.map(row => [row.round.stepKey, row]));
    const now = new Date();
    return this.registry.all.map(step => {
      const row = latest.get(generatorKeyOf(step));
      const latestRound = row ? viewRound(step, presentRound(row, now)) : null;
      return { step, latestRound, sliceMoved: lockedSliceMoved(step, latestRound?.options ?? null, ledger) };
    });
  }

  /**
   * Writes the round's ledger effects and the round itself in one transaction; the caller queues the job once it has committed. A round
   * asked for on a sourced screen runs on its pass, focused on that screen.
   */
  async openRound(projectId: bigint, stepKey: string, body: OpenRoundInput): Promise<Blueprint.Round> {
    const addressed = this.registry.get(stepKey);
    const { generator, focus } = this.registry.roundTarget(stepKey);
    const input = authorInput(addressed, generator, focus, body);
    return this.db.transaction(async tx => {
      await this.rounds.lockStep(projectId, generator.key, tx);
      await loadBlueprintProject(tx, projectId);
      const latest = await this.rounds.latestForStep(projectId, generator.key, tx);
      if (latest) await this.settleStale(latest, tx);

      const offered = await this.offeredOptions(addressed, projectId, tx);
      assertOfferedOptions(
        input.feedback.map(item => item.optionId),
        offered,
      );
      const effects = roundLedgerEffects(addressed, input, offered);
      if (effects.length > 0) await this.ledger.append(projectId, effects, tx);

      return this.rounds.create(
        {
          projectId,
          stepKey: generator.key,
          round: (latest?.round.round ?? 0) + 1,
          steer: input.steer,
          nudges: input.nudges,
          keepAsDirection: input.keepAsDirection,
          feedback: input.feedback,
          input: input.input,
          focus,
        },
        tx,
      );
    });
  }

  async lock(projectId: bigint, stepKey: string, rawSelection: unknown): Promise<LockResult> {
    const step = this.registry.lockable(stepKey);
    const selection = validateStepPart<unknown>(step.selectionSchema, rawSelection, 'selection');
    const committed = await this.db.transaction(tx => this.lockInTransaction(projectId, step, selection, tx));
    this.logger.info('blueprint step locked', {
      projectId,
      stepKey,
      entries: committed.entries.length,
      withdrawn: committed.withdrawn.length,
      proposalId: committed.proposal?.id,
    });
    const { plan, ...result } = committed;
    return { ...result, followUp: await this.followUp(projectId, step, plan, result) };
  }

  private async lockInTransaction(projectId: bigint, step: AnyLockingStep, selection: unknown, tx: PrimaryTransaction): Promise<CommittedLock> {
    const generatorKey = generatorKeyOf(step);
    await this.rounds.lockStep(projectId, generatorKey, tx);
    const project = await loadBlueprintProject(tx, projectId);
    const latest = await this.rounds.latestForStep(projectId, generatorKey, tx);
    if (latest && isActiveRound(presentRound(latest).status) && !runsBeside(step, latest.round)) throw AppErrorCode.BPR_002.create();

    const ready = await this.rounds.latestReady(projectId, generatorKey, tx);
    const view = ready ? viewOf(step, ready.options) : null;
    assertOfferedOptions(step.chosenOptionIds(selection), ready ? describeView(step, view) : []);
    const active = await loadActiveLedger(tx, projectId);
    const materialised = await step.materialise(selection, { round: ready ? { round: ready.round, options: view } : null, ledger: active, project, tx });
    // A lock with no ready round was answered from nothing, so there is no slice it could later be said to have moved away from.
    const plan = isSourced(step) && ready ? { ...materialised, entries: stampLockedSlice(materialised.entries, sliceDigest(view)) } : materialised;

    const proposal = await this.applyAsAuthor(projectId, step, plan, tx);
    return { ...(await this.writeLockEntries(projectId, step, plan, active, tx)), proposal, plan };
  }

  /** Runs once the lock has committed, so its failure is reported beside the lock rather than undoing it. */
  private async followUp(projectId: bigint, step: AnyLockingStep, plan: LockPlan, result: Omit<LockResult, 'followUp'>): Promise<LockFollowUp | null> {
    if (!plan.afterCommit) return null;
    try {
      await plan.afterCommit({ projectId, entries: result.entries, proposal: result.proposal, runActions: ops => this.runActions(projectId, ops) });
      return { ok: true };
    } catch (err) {
      this.logger.error('blueprint lock follow-up failed', { projectId, stepKey: step.key, err });
      return { ok: false, error: AppError.is(err) && !err.isInternal ? err.message : 'The follow-up work failed; the lock itself is saved.' };
    }
  }

  /** Approving what a lock materialised is an action, and an action runs its own transactions — so it waits for the lock's to commit. */
  private async runActions(projectId: bigint, ops: ActionOp[]): Promise<void> {
    for (const op of ops) {
      if (!BLUEPRINT_ACTION_OPS.includes(op.op)) throw AppError.internal(`"${op.op}" is not a Blueprint follow-up action`);
      const executor = this.actions.get(op.op);
      if (!executor) throw AppError.internal(`no executor is registered for "${op.op}"`);
      const result = await executor(projectId, op, { autoApplied: false, blueprintLock: true });
      this.logger.info('blueprint lock follow-up action ran', { projectId, op: op.op, summary: result.summary });
    }
  }

  /**
   * Materialised content is applied as the author's own change inside the lock's transaction, so the change history lists it and a revert
   * undoes it, and the content commits or rolls back together with the ledger entries that link to it.
   */
  private async applyAsAuthor(projectId: bigint, step: AnyLockingStep, plan: LockPlan, tx: PrimaryTransaction): Promise<Refinement.Proposal | null> {
    if (!plan.changeSet?.length) return null;
    const summary = plan.summary ?? `Blueprint: ${step.key} locked`;
    const proposal = await this.proposals.create(
      projectId,
      { kind: 'blueprint', scopeType: 'project', scopeRef: `blueprint:${step.key}`, summary, changeSet: plan.changeSet, allowedOps: BLUEPRINT_CHANGE_OPS },
      tx,
    );
    const applied = await this.proposalApply.apply(projectId, proposal.id, { tx });
    return applied.proposal;
  }

  private async writeLockEntries(
    projectId: bigint,
    step: AnyLockingStep,
    plan: LockPlan,
    active: Ledger.Entry[],
    tx: PrimaryTransaction,
  ): Promise<Omit<LockResult, 'proposal' | 'followUp'>> {
    const { supersede, append, withdraw } = reconcileLockEntries(step, plan, active);
    const entries: Ledger.Entry[] = [];
    for (const { previous, next } of supersede) entries.push(await this.ledger.supersede(projectId, previous.id, successorOf(next), tx));
    entries.push(...(await this.ledger.append(projectId, append, tx)));
    const withdrawn: Ledger.Entry[] = [];
    for (const entry of withdraw) withdrawn.push(await this.ledger.withdraw(projectId, entry.id, RELOCK_WITHDRAW_REASON, tx));
    return { entries, withdrawn };
  }

  private async offeredOptions(addressed: AnyBlueprintStep, projectId: bigint, tx: PrimaryTransaction): Promise<StepOption[]> {
    const ready = await this.rounds.latestReady(projectId, generatorKeyOf(addressed), tx);
    return ready ? describeView(addressed, viewOf(addressed, ready.options)) : [];
  }

  private async settleStale(latest: RoundWithJob, tx: PrimaryTransaction): Promise<void> {
    const presented = presentRound(latest);
    if (isActiveRound(presented.status)) throw AppErrorCode.BPR_002.create();
    if (!isActiveRound(latest.round.status)) return;
    await this.rounds.settle(latest.round.id, presented.status === 'cancelled' ? 'cancelled' : 'failed', presented.error, tx);
  }
}
