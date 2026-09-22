import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Ledger } from '@server/database';

import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { blueprintSpinePrompt } from '../../ai/prompts/blueprint-spine.prompt';
import {
  type BlueprintSpineOutput,
  MOVEMENT_CHAPTERS_MAX,
  MOVEMENT_CHAPTERS_MIN,
  MOVEMENTS_MAX,
  REVEAL_TERMS_MAX,
  REVEALS_MAX,
  SPINE_LINE_MAX,
  SPINE_NAME_MAX,
} from '../../ai/schemas/blueprint-spine.schema';
import { type PassStep, type StepInputContext, type StepOption } from '../engine/blueprint-step.types';
import { type StageLedgerEntry } from '../stage/blueprint-stage';
import { promiseLength, promiseTailoringApplies } from '../stage/promise-tailoring';
import { ENDING_TOPIC } from './heart.step';
import { renderLockedCrucible, renderLockedOpposition } from './locked-cast';
import { planningSections } from './planning-context';

export const SPINE_PASS_STEP_KEY = 'spine_pass';
export const SPINE_BUDGET_TOKENS = 30_000;

/** Slice of life turns the whole novel into seasons of a life and the reveal schedule into the milestones it passes. */
export const SPINE_MODES = ['movements', 'seasons'] as const;

export type SpineMode = (typeof SPINE_MODES)[number];

/** Rough chapter counts the coach plans around, so "short" does not silently mean the same novel as "long". */
const LENGTH_CHAPTERS: Record<string, number> = { short: 60, medium: 150, long: 300 };
const DEFAULT_CHAPTERS = LENGTH_CHAPTERS['medium'] as number;

@Schema()
export class SpineMovementOption {
  @Field({ pattern: '^mv[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: SPINE_NAME_MAX })
  title: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX })
  summary: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX, description: 'What changes in the protagonist across this movement.' })
  change: string;

  @Field(() => Integer, { minimum: MOVEMENT_CHAPTERS_MIN, maximum: MOVEMENT_CHAPTERS_MAX })
  chapters: number;
}

@Schema()
export class SpineRevealOption {
  @Field({ pattern: '^rv[0-9]+$' })
  id: string;

  @Field(() => Integer, { minimum: 1, description: 'The movement it comes out in, which is what schedules the canon fact the lock mints for it.' })
  movement: number;

  @Field({ minLength: 1, maxLength: SPINE_NAME_MAX })
  when: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX, description: 'The secret itself. It reaches the author and the canon facts, never a Story Bible page.' })
  truth: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX, description: 'The only part of the reveal an earlier chapter’s writer is shown; it must instruct without telling.' })
  writerNote: string;

  @Field(() => [String], { maxItems: REVEAL_TERMS_MAX, description: 'The give-away names and phrases no chapter before the reveal may use.' })
  terms: string[];

  @Field({ description: 'The first reveal is the one the author pins now; the rest stay sketches they may move.' })
  pinned: boolean;
}

@Schema()
export class SpineSliceOptions {
  @Field(() => String, { enum: [...SPINE_MODES] })
  mode: SpineMode;

  @Field({ description: 'The ending question, as the Heart phase pinned it; the spine places it and never rewords it.' })
  endingQuestion: string;

  @Field({ description: 'Whether this novel’s reader promise makes the schedule part of the answer rather than an extra.' })
  revealsRequired: boolean;

  @Field(() => [SpineMovementOption], { maxItems: MOVEMENTS_MAX })
  movements: SpineMovementOption[];

  @Field(() => [SpineRevealOption], { maxItems: REVEALS_MAX })
  reveals: SpineRevealOption[];

  @Field({ description: 'How the last movement answers the ending question.' })
  note: string;
}

@Schema()
export class SpineOptions {
  @Field(() => SpineSliceOptions, { optional: true })
  spine?: SpineSliceOptions;
}

export type EndingLedgerEntry = StageLedgerEntry & Pick<Ledger.Entry, 'statement'>;

export function spineMode(ledger: StageLedgerEntry[]): SpineMode {
  return promiseTailoringApplies('seasons', ledger) ? 'seasons' : 'movements';
}

/** The ending question is a Heart decision: the spine pins it, so it is read from the ledger rather than asked of the model again. */
export function endingQuestion(ledger: EndingLedgerEntry[]): string {
  const decided = [...ledger].reverse().find(entry => entry.topic === ENDING_TOPIC && entry.kind === 'decision');
  return decided?.statement.trim() ?? '';
}

export function spineChapterTarget(ledger: StageLedgerEntry[]): number {
  const length = promiseLength(ledger);
  return (length === null ? undefined : LENGTH_CHAPTERS[length]) ?? DEFAULT_CHAPTERS;
}

function spineSlice(output: BlueprintSpineOutput, ledger: Ledger.Entry[]): SpineSliceOptions {
  const movements = output.movements.map((movement, index) => ({
    id: `mv${index + 1}`,
    title: movement.title.trim(),
    summary: movement.summary.trim(),
    change: movement.change.trim(),
    chapters: movement.chapters,
  }));
  const reveals = (output.reveals ?? []).map((reveal, index) => ({
    id: `rv${index + 1}`,
    movement: Math.min(Math.max(reveal.movement, 1), Math.max(movements.length, 1)),
    when: reveal.when.trim(),
    truth: reveal.truth.trim(),
    writerNote: reveal.writerNote.trim(),
    terms: (reveal.terms ?? []).map(term => term.trim()).filter(Boolean),
    pinned: index === 0,
  }));
  return {
    mode: spineMode(ledger),
    endingQuestion: endingQuestion(ledger),
    revealsRequired: promiseTailoringApplies('reveal_schedule', ledger),
    movements,
    reveals,
    note: output.note?.trim() ?? '',
  };
}

function renderScope(ledger: Ledger.Entry[]): string {
  const mode = spineMode(ledger);
  const seasons = mode === 'seasons';
  const reveals = promiseTailoringApplies('reveal_schedule', ledger);
  const target = spineChapterTarget(ledger);
  return [
    seasons
      ? 'This novel is a slice of life: the movements are seasons of a life rather than an escalation, and each one changes the protagonist by living, not by winning.'
      : 'The movements escalate: each one raises what the last one settled.',
    reveals
      ? 'Mystery drives this novel, so the reveal schedule is part of the answer, not an extra — produce it.'
      : seasons
        ? 'Produce the same field as a list of milestones this life passes rather than concealed truths.'
        : 'A reveal schedule is optional here; produce one only where the novel genuinely withholds something.',
    `Plan for roughly ${target} chapters across the whole novel; the movements must add up to about that.`,
    `The ending question is pinned and must not be reworded: ${endingQuestion(ledger) || 'it is not decided yet — shape the last movement around what the notebook does settle.'}`,
    `The crucible the movements have to move, one step per movement:\n${renderLockedCrucible(ledger)}`,
    `What opposes them, which has to escalate alongside it:\n${renderLockedOpposition(ledger)}`,
  ].join('\n');
}

function renderKept(options: SpineOptions): string | null {
  const slice = options.spine;
  if (!slice) return null;
  const movements = slice.movements.map(movement => `- ${movement.title}: ${movement.summary} (${movement.change})`).join('\n');
  return `The spine on the author's screen:\n${movements}`;
}

export const spinePass: PassStep<BlueprintSpineOutput, SpineOptions, never> = {
  kind: 'pass',
  key: SPINE_PASS_STEP_KEY,
  phase: 'spine',
  nudges: [],
  prompt: blueprintSpinePrompt,
  optionsSchema: SpineOptions,
  budgetTokens: SPINE_BUDGET_TOKENS,

  async inputs(context: StepInputContext<SpineOptions>): Promise<BlueprintInputSection[]> {
    const sections: BlueprintInputSection[] = [{ key: 'spine_scope', content: renderScope(context.ledger), required: true }];
    sections.push(...(await planningSections(context)));
    const kept = context.focus && context.previous ? renderKept(context.previous) : null;
    if (kept) sections.push({ key: 'spine_so_far', content: kept });
    return sections;
  },

  toRound(output, { ledger }) {
    const spine = spineSlice(output, ledger);
    if (spine.movements.length === 0) throw AppErrorCode.AI_001.create();
    return { options: { spine }, coachMessage: output.coachMessage.trim() };
  },

  describeOptions(options) {
    const movements = (options.spine?.movements ?? []).map((movement): StepOption => ({ id: movement.id, label: `${movement.title} — ${movement.summary}` }));
    const reveals = (options.spine?.reveals ?? []).map((reveal): StepOption => ({ id: reveal.id, label: `${reveal.when}: ${reveal.truth}` }));
    return [...movements, ...reveals];
  },
};
