import { type SchemaClass } from '@shadow-library/class-schema';

import { type Blueprint, type DbExecutor, type Ledger, type PrimaryTransaction, type Project, type Refinement } from '@server/database';

import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { type PromptModule } from '../../ai/prompts/types';
import { type ContentOp } from '../../refinement/change-set';
import { type NewLedgerEntry } from '../ledger/ledger.types';

export const BLUEPRINT_ROLES = ['blueprint', 'blueprint_pass'] as const;

export type BlueprintRole = (typeof BLUEPRINT_ROLES)[number];

export interface StepInputContext<TOptions = unknown> {
  projectId: bigint;
  project: Project.Row;
  ledger: Ledger.Entry[];
  db: DbExecutor;
  /** The generating step's latest ready options, so a focused round can show the model what it must keep. */
  previous: TOptions | null;
  /** The screen a pass round was started from; null when the round regenerates everything. */
  focus: string | null;
}

/** An option as the author and the ledger name it: the id feedback and locks address it by, and the label a rejected entry records. */
export interface StepOption {
  id: string;
  label: string;
}

export interface RoundContext<TOptions, TInput> {
  previous: TOptions | null;
  input: TInput | null;
  focus: string | null;
}

export interface StepRoundResult<TOptions> {
  options: TOptions;
  coachMessage: string;
}

export interface LockedRound<TView> {
  round: number;
  options: TView;
}

export interface MaterialiseContext<TView> {
  /** The latest ready round (sliced for a sourced screen), when there is one; a lock never reads older rounds. */
  round: LockedRound<TView> | null;
  ledger: Ledger.Entry[];
  project: Project.Row;
  tx: PrimaryTransaction;
}

/** The step's phase and the author are the defaults; links address what the change-set produces by its keys. */
export type PlannedLedgerEntry = Omit<NewLedgerEntry, 'phase' | 'decidedBy' | 'stepKey'> & { phase?: Ledger.Phase | null; decidedBy?: Ledger.DecidedBy };

export interface AfterCommitContext {
  projectId: bigint;
  entries: Ledger.Entry[];
  proposal: Refinement.Proposal | null;
}

export interface LockPlan {
  entries: PlannedLedgerEntry[];
  /** Content the lock materialises, applied as the author's own change so change history and revert cover it. Content ops only. */
  changeSet?: ContentOp[];
  summary?: string;
  /** Topics whose earlier lock entries this lock retires; defaults to the step's completion topics plus every topic it writes. */
  replaces?: string[];
  /** Work that must follow the commit, such as approving what was materialised or queueing a job; its failure never undoes the lock. */
  afterCommit?(context: AfterCommitContext): Promise<void>;
}

interface StepBase {
  key: string;
  phase: Ledger.Phase;
  /** Short steers the steer box offers as chips; when non-empty, the only nudges a round may carry. */
  nudges: readonly string[];
}

/**
 * Methods rather than function properties throughout, so a typed step is assignable to the registry's erased form without casting away its
 * parameter types.
 */
export interface GeneratingStep<TOutput, TOptions, TInput> extends StepBase {
  prompt: PromptModule<TOutput>;
  optionsSchema: SchemaClass;
  /** The step's own freeform input for a round; a step without one refuses any. */
  inputSchema?: SchemaClass;
  budgetTokens?: number;
  inputs?(context: StepInputContext<TOptions>): Promise<BlueprintInputSection[]>;
  renderInput?(input: TInput): string | null;
  toRound(output: TOutput, context: RoundContext<TOptions, TInput>): StepRoundResult<TOptions>;
  /** Every option the round offers, with ids unique across the whole round. */
  describeOptions(options: TOptions): StepOption[];
}

export interface LockingStep<TView, TSelection> {
  /** Whether locking this step counts towards its phase's completion; an optional step never holds a phase back. */
  required: boolean;
  /** Topics whose active decisions mean this step is done. */
  completionTopics: readonly string[];
  /** Whether the novel's active decisions call for this step (a power ladder only when progression drives it); omitted means always. */
  appliesWhen?(ledger: Ledger.Entry[]): boolean;
  selectionSchema: SchemaClass;
  chosenOptionIds(selection: TSelection): string[];
  materialise(selection: TSelection, context: MaterialiseContext<TView>): Promise<LockPlan>;
}

/** A screen that generates its own options and locks them. */
export interface ScreenStep<TOutput, TOptions, TInput, TSelection> extends GeneratingStep<TOutput, TOptions, TInput>, LockingStep<TOptions, TSelection> {
  kind: 'screen';
}

/** One large generation feeding several screens; it is never shown or locked itself. */
export interface PassStep<TOutput, TOptions, TInput> extends GeneratingStep<TOutput, TOptions, TInput> {
  kind: 'pass';
}

export interface StepSource<TPassOptions, TView> {
  step: string;
  select(options: TPassOptions): TView;
}

/** A screen showing its slice of a pass: its rounds are the pass's rounds, focused on it. */
export interface SourcedScreenStep<TPassOptions, TView, TSelection> extends StepBase, LockingStep<TView, TSelection> {
  kind: 'screen';
  source: StepSource<TPassOptions, TView>;
  describeView(view: TView): StepOption[];
}

export type AnyGeneratingStep = ScreenStep<unknown, unknown, unknown, unknown> | PassStep<unknown, unknown, unknown>;
export type AnyLockingStep = ScreenStep<unknown, unknown, unknown, unknown> | SourcedScreenStep<unknown, unknown, unknown>;
export type AnyBlueprintStep = AnyGeneratingStep | SourcedScreenStep<unknown, unknown, unknown>;

export function isSourced(step: AnyBlueprintStep): step is SourcedScreenStep<unknown, unknown, unknown> {
  return 'source' in step;
}

export function isGenerating(step: AnyBlueprintStep): step is AnyGeneratingStep {
  return !isSourced(step);
}

export function isLocking(step: AnyBlueprintStep): step is AnyLockingStep {
  return step.kind === 'screen';
}

export interface RoundAuthorInput {
  steer: string | null;
  nudges: string[];
  keepAsDirection: boolean;
  feedback: Blueprint.OptionFeedback[];
  input: unknown;
  focus: string | null;
}
