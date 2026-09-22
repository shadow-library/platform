import { type SchemaClass } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Blueprint, type Job, type Ledger } from '@server/database';

import { type BlueprintStepMessage } from '../../ai/context/blueprint-sections';
import { parseSchema, renderSchemaIssues } from '../../ai/schemas/validate';
import { type NewLedgerEntry } from '../ledger/ledger.types';
import { rejectedTopic, steerTopic } from './blueprint-step.registry';
import {
  type AnyBlueprintStep,
  type AnyGeneratingStep,
  type AnyLockingStep,
  isSourced,
  type LockPlan,
  type PlannedLedgerEntry,
  type RoundAuthorInput,
  type StepOption,
} from './blueprint-step.types';

export const ACTIVE_ROUND_STATUSES: readonly Blueprint.RoundStatus[] = ['pending', 'running'];
export const UNQUEUED_ROUND_GRACE_MS = 60_000;
export const NUDGE_MAX_LENGTH = 80;

const FEEDBACK_LABELS: Record<Blueprint.FeedbackVerdict, string> = { more: 'More like this', not: 'Not this', mix: 'Mix this in' };

export interface EffectiveRoundStatus {
  status: Blueprint.RoundStatus;
  error: string | null;
}

type RoundState = Pick<Blueprint.Round, 'status' | 'jobId' | 'createdAt' | 'error'>;

export function isActiveRound(status: Blueprint.RoundStatus): boolean {
  return ACTIVE_ROUND_STATUSES.includes(status);
}

/**
 * A round records its own outcome, but a job cancelled before it ran, or one that died with its process, never reaches the runner that
 * would record it; the job row is the truth for those, so a stuck round cannot block its step forever.
 */
export function effectiveRoundStatus(round: RoundState, jobStatus: Job.Status | null, now: Date): EffectiveRoundStatus {
  const settled = { status: round.status, error: round.error };
  if (!isActiveRound(round.status)) return settled;
  if (round.jobId === null) return now.getTime() - round.createdAt.getTime() > UNQUEUED_ROUND_GRACE_MS ? { status: 'failed', error: 'The round was never queued.' } : settled;
  if (jobStatus === 'cancelled') return { status: 'cancelled', error: null };
  if (jobStatus === 'failed' || jobStatus === 'done') return { status: 'failed', error: round.error ?? 'The round stopped before it produced options.' };
  return settled;
}

export function validateStepPart<T>(schema: SchemaClass, value: unknown, part: string): T {
  const parsed = parseSchema<T>(schema, value);
  if (!parsed.success) throw AppErrorCode.BPR_004.create({ part, issues: renderSchemaIssues(parsed.issues).replace(/\n/g, ' ') });
  return parsed.data;
}

export function assertOfferedOptions(optionIds: string[], offered: StepOption[]): void {
  const known = new Set(offered.map(option => option.id));
  const unknown = optionIds.find(id => !known.has(id));
  if (unknown !== undefined) throw AppErrorCode.BPR_005.create({ optionId: unknown });
}

function authorMessage(round: Pick<Blueprint.Round, 'steer' | 'nudges'>): string | null {
  const parts = [round.steer?.trim(), round.nudges.length > 0 ? `(${round.nudges.join('; ')})` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * The step's conversation: each earlier round's steer and the coach's reply. Options never enter it, so an old round's cards cannot resurface.
 * A round focused on one screen of a pass hears only that screen's rounds and whole-pass rounds, never a sibling screen's.
 */
export function stepMessages(rounds: Pick<Blueprint.Round, 'round' | 'steer' | 'nudges' | 'coachMessage' | 'focus'>[], focus: string | null = null): BlueprintStepMessage[] {
  return rounds
    .filter(round => focus === null || round.focus === null || round.focus === focus)
    .sort((a, b) => a.round - b.round)
    .flatMap(round => {
      const author = authorMessage(round);
      const messages: BlueprintStepMessage[] = author ? [{ from: 'author', text: author }] : [];
      return round.coachMessage ? [...messages, { from: 'coach', text: round.coachMessage }] : messages;
    });
}

export function generatorKeyOf(step: AnyBlueprintStep): string {
  return isSourced(step) ? step.source.step : step.key;
}

/** What `step` shows of its generator's options: a sourced screen's slice, or the options themselves. */
export function viewOf(step: AnyBlueprintStep, options: unknown): unknown {
  return isSourced(step) ? step.source.select(options) : options;
}

export function describeView(step: AnyBlueprintStep, view: unknown): StepOption[] {
  return isSourced(step) ? step.describeView(view) : step.describeOptions(view);
}

function labelOf(optionId: string, offered: StepOption[]): string {
  return offered.find(option => option.id === optionId)?.label ?? optionId;
}

export function renderRoundInput(step: AnyGeneratingStep, input: RoundAuthorInput, offered: StepOption[]): string {
  const freeform = input.input === undefined || input.input === null ? null : (step.renderInput?.(input.input) ?? null);
  const feedback = input.feedback.map(
    item => `- ${FEEDBACK_LABELS[item.verdict]}: ${labelOf(item.optionId, offered)}${item.reason ? ` (the author's reason: ${item.reason})` : ''}`,
  );
  const blocks = [
    input.focus ? `Focus: rework only the "${input.focus}" part; keep every other part exactly as it is.` : null,
    freeform,
    input.steer ? `Steer: ${input.steer}` : null,
    input.nudges.length > 0 ? `Nudges: ${input.nudges.join('; ')}` : null,
    feedback.length > 0 ? `On the last round's options:\n${feedback.join('\n')}` : null,
  ].filter((block): block is string => block !== null);
  return blocks.length > 0 ? blocks.join('\n\n') : 'No steer this round: offer your best reading.';
}

export function resolveNudges(step: Pick<AnyBlueprintStep, 'nudges'>, nudges: string[]): string[] {
  const resolved = [...new Set(nudges.map(nudge => nudge.trim()).filter(Boolean))];
  const tooLong = resolved.find(nudge => nudge.length > NUDGE_MAX_LENGTH);
  if (tooLong !== undefined) throw AppErrorCode.BPR_004.create({ part: 'nudges', issues: `a nudge is longer than ${NUDGE_MAX_LENGTH} characters` });
  const unknown = step.nudges.length > 0 ? resolved.find(nudge => !step.nudges.includes(nudge)) : undefined;
  if (unknown !== undefined) throw AppErrorCode.BPR_004.create({ part: 'nudges', issues: `"${unknown}" is not one of this step's nudges; write it as a steer` });
  return resolved;
}

/** What starting a round writes to the ledger before the job is queued: a kept steer, and each option killed with a reason, once. */
export function roundLedgerEffects(step: Pick<AnyBlueprintStep, 'key' | 'phase'>, input: RoundAuthorInput, offered: StepOption[]): NewLedgerEntry[] {
  const entries: NewLedgerEntry[] = [];
  const steer = input.steer?.trim();
  if (input.keepAsDirection && steer) entries.push({ kind: 'direction', phase: step.phase, topic: steerTopic(step), statement: steer, decidedBy: 'author' });
  const killed = new Set<string>();
  for (const item of input.feedback) {
    const reason = item.reason?.trim();
    if (item.verdict !== 'not' || !reason || killed.has(item.optionId)) continue;
    killed.add(item.optionId);
    entries.push({ kind: 'rejected', phase: step.phase, topic: rejectedTopic(step), statement: labelOf(item.optionId, offered), why: reason, decidedBy: 'author' });
  }
  return entries;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

/** A fingerprint of the options a screen locked from, so a later whole-pass rerun that moved them can be shown as having moved them. */
export function sliceDigest(view: unknown): string {
  return Bun.hash(JSON.stringify(canonical(view) ?? null)).toString(16);
}

/** Stamps the fingerprint onto the decisions a lock writes; nothing else reads `lockedSlice`, and it never takes part in pairing. */
export function stampLockedSlice(entries: PlannedLedgerEntry[], digest: string): PlannedLedgerEntry[] {
  return entries.map(entry => (entry.kind === 'decision' ? { ...entry, payload: { ...(entry.payload as object | null), lockedSlice: digest } } : entry));
}

export function lockedSliceOf(entry: Pick<Ledger.Entry, 'payload'>): string | null {
  const digest = (entry.payload as { lockedSlice?: unknown } | null | undefined)?.lockedSlice;
  return typeof digest === 'string' ? digest : null;
}

/**
 * A locked screen whose part of the pass is no longer the one it was locked from. Steering a sibling screen keeps this screen's part
 * byte for byte, but rerunning the whole pass reworks it, and an answer that no longer matches what produced it is said out loud
 * rather than quietly replaced.
 */
export function lockedSliceMoved(step: AnyBlueprintStep, view: unknown, ledger: Ledger.Entry[]): boolean {
  if (!isSourced(step) || view === null || view === undefined) return false;
  const locked = ledger
    .filter(entry => entry.stepKey === step.key && entry.kind === 'decision')
    .map(lockedSliceOf)
    .filter((digest): digest is string => digest !== null);
  return locked.length > 0 && !locked.includes(sliceDigest(view));
}

/**
 * What a lock has not already said. A rejection and a backlog item live outside the topics a lock replaces, because they survive every
 * later answer — which also means a re-lock that repeats one must not write it a second time.
 */
export function withoutKnownEntries(entries: PlannedLedgerEntry[], ledger: Ledger.Entry[], kind: Ledger.Kind): PlannedLedgerEntry[] {
  const said = (entry: Pick<Ledger.Entry, 'topic' | 'statement'>): string => `${entry.topic}|${entry.statement.trim().toLowerCase()}`;
  const known = new Set(ledger.filter(entry => entry.kind === kind).map(said));
  return entries.filter(entry => entry.kind !== kind || !known.has(said(entry)));
}

export function withoutKnownRejections(entries: PlannedLedgerEntry[], ledger: Ledger.Entry[]): PlannedLedgerEntry[] {
  return withoutKnownEntries(entries, ledger, 'rejected');
}

export interface LedgerReconciliation {
  supersede: { previous: Ledger.Entry; next: NewLedgerEntry }[];
  append: NewLedgerEntry[];
  withdraw: Ledger.Entry[];
}

const RELOCKED_KINDS: ReadonlySet<Ledger.Kind> = new Set(['decision', 'direction', 'rejected', 'system']);

function optionIdOf(entry: Pick<NewLedgerEntry, 'payload'>): string | undefined {
  const optionId = (entry.payload as { optionId?: unknown } | null | undefined)?.optionId;
  return typeof optionId === 'string' ? optionId : undefined;
}

/** The option an entry answers, and the side of it when one answer is split across two entries (a taste pair answered "neither"). */
function optionKeyOf(entry: Pick<NewLedgerEntry, 'payload'>): string | undefined {
  const optionId = optionIdOf(entry);
  if (optionId === undefined) return undefined;
  const side = (entry.payload as { side?: unknown } | null | undefined)?.side;
  return typeof side === 'string' ? `${optionId}#${side}` : optionId;
}

type Matcher = (previous: Ledger.Entry, next: NewLedgerEntry) => boolean;

const PAIRING: Matcher[] = [
  (previous, next) => optionKeyOf(next) !== undefined && optionKeyOf(previous) === optionKeyOf(next),
  (previous, next) => previous.statement.trim() === next.statement.trim(),
  (previous, next) => optionIdOf(previous) === undefined && optionIdOf(next) === undefined,
];

/**
 * Two entries that name different offered options are answers to different questions, so pairing them would rewrite one as the
 * other. Only the same option, or no option on either side, may ever be paired — and the order-based fallback, which knows nothing
 * beyond position, is restricted to entries that name no option at all.
 */
function crossesOptions(previous: Ledger.Entry, next: NewLedgerEntry): boolean {
  const before = optionKeyOf(previous);
  const after = optionKeyOf(next);
  return before !== undefined && after !== undefined && before !== after;
}

/**
 * One lock writes the step's whole answer: locking again retires what the step's earlier locks wrote on the topics it replaces (its
 * completion topics and every topic it writes, unless the plan narrows them). Each new entry supersedes an earlier one of the same topic,
 * kind and offered option (the same option first, then the same statement, then in order), so every topic keeps one history chain; leftovers
 * are appended or withdrawn. An entry that names an option is only withdrawn when the new answer speaks to its topic and kind at all, so a
 * lock that says nothing about a kind cannot silently retire it. What the author wrote directly, steering entries and backlog entries are
 * never touched.
 */
export function reconcileLockEntries(
  step: Pick<AnyLockingStep, 'key' | 'phase' | 'completionTopics'>,
  plan: Pick<LockPlan, 'entries' | 'replaces' | 'retires'>,
  active: Ledger.Entry[],
): LedgerReconciliation {
  const next = plan.entries.map((entry): NewLedgerEntry => ({ ...entry, phase: entry.phase ?? step.phase, decidedBy: entry.decidedBy ?? 'author', stepKey: step.key }));
  const topics = new Set(plan.replaces ?? [...step.completionTopics, ...next.map(entry => entry.topic)]);
  const replaceable = active.filter(entry => entry.stepKey === step.key && topics.has(entry.topic) && RELOCKED_KINDS.has(entry.kind));

  const pairs = new Map<NewLedgerEntry, Ledger.Entry>();
  const taken = new Set<Ledger.Entry>();
  for (const matches of PAIRING) {
    for (const entry of next) {
      if (pairs.has(entry)) continue;
      const previous = replaceable.find(old => !taken.has(old) && old.topic === entry.topic && old.kind === entry.kind && !crossesOptions(old, entry) && matches(old, entry));
      if (!previous) continue;
      pairs.set(entry, previous);
      taken.add(previous);
    }
  }

  const answered = new Set(next.map(entry => `${entry.topic}|${entry.kind}`));
  const retired = new Set(plan.retires ?? []);
  const stranded = (entry: Ledger.Entry): boolean => {
    const optionId = optionIdOf(entry);
    return optionId === undefined || retired.has(optionId) || answered.has(`${entry.topic}|${entry.kind}`);
  };

  return {
    supersede: next.flatMap(entry => {
      const previous = pairs.get(entry);
      return previous ? [{ previous, next: entry }] : [];
    }),
    append: next.filter(entry => !pairs.has(entry)),
    withdraw: replaceable.filter(entry => !taken.has(entry) && stranded(entry)),
  };
}
