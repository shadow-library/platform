import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';

import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { blueprintConceptsPrompt } from '../../ai/prompts/blueprint-concepts.prompt';
import {
  BLUEPRINT_CONCEPT_COUNT,
  type BlueprintConceptsOutput,
  CONCEPT_ENGINE_MAX,
  CONCEPT_HOOK_MAX,
  CONCEPT_LOGLINE_MAX,
  CONCEPT_TITLE_MAX,
} from '../../ai/schemas/blueprint-concepts.schema';
import { withoutKnownRejections } from '../engine/blueprint-round';
import { type PlannedLedgerEntry, type ScreenStep, type StepInputContext } from '../engine/blueprint-step.types';

export const CONCEPTS_TOPIC = 'concepts';
/** Kills live apart from the kept card so a later lock can never replace them: a refusal the author gave a reason for is permanent. */
export const CONCEPTS_KILLED_TOPIC = 'concepts.killed';
export const CONCEPT_KILL_REASON_MAX = 500;
export const CONCEPT_KEPT_WHY_MAX = 500;

@Schema()
export class ConceptCardOption {
  @Field({ pattern: '^c[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: CONCEPT_TITLE_MAX })
  title: string;

  @Field({ minLength: 1, maxLength: CONCEPT_LOGLINE_MAX })
  logline: string;

  @Field({ minLength: 1, maxLength: CONCEPT_ENGINE_MAX })
  engine: string;

  @Field({ minLength: 1, maxLength: CONCEPT_HOOK_MAX })
  hook: string;

  @Field({ optional: true })
  fromAuthor?: boolean;
}

@Schema()
export class ConceptsOptions {
  @Field(() => [ConceptCardOption], { maxItems: BLUEPRINT_CONCEPT_COUNT })
  cards: ConceptCardOption[];
}

@Schema()
export class ConceptKept {
  @Field({ pattern: '^c[0-9]+$' })
  optionId: string;

  @Field({ optional: true, minLength: 1, maxLength: CONCEPT_TITLE_MAX, description: 'The title as the author edited it.' })
  title?: string;

  @Field({ optional: true, minLength: 1, maxLength: CONCEPT_LOGLINE_MAX, description: 'The logline as the author edited it; it becomes the direction every later step reads.' })
  logline?: string;

  @Field({ optional: true, maxLength: CONCEPT_KEPT_WHY_MAX, description: 'What the author kept it for.' })
  why?: string;
}

@Schema()
export class ConceptKilled {
  @Field({ pattern: '^c[0-9]+$' })
  optionId: string;

  @Field({ minLength: 1, maxLength: CONCEPT_KILL_REASON_MAX, description: 'The author’s reason; it is what stops a later round proposing the same concept again.' })
  reason: string;
}

@Schema()
export class ConceptsSelection {
  @Field(() => ConceptKept)
  kept: ConceptKept;

  @Field(() => [ConceptKilled], { optional: true, maxItems: BLUEPRINT_CONCEPT_COUNT })
  killed?: ConceptKilled[];
}

function asCard(card: BlueprintConceptsOutput['cards'][number], index: number): ConceptCardOption {
  const fromAuthor = card.fromAuthor === true ? { fromAuthor: true } : {};
  return { id: `c${index + 1}`, title: card.title.trim(), logline: card.logline.trim(), engine: card.engine.trim(), hook: card.hook.trim(), ...fromAuthor };
}

function keptEntry(card: ConceptCardOption, kept: ConceptKept): PlannedLedgerEntry {
  const title = kept.title?.trim() || card.title;
  const logline = kept.logline?.trim() || card.logline;
  return {
    kind: 'direction',
    topic: CONCEPTS_TOPIC,
    statement: logline,
    why: kept.why?.trim() || `Kept “${title}” — what keeps it going: ${card.engine}`,
    // `cardId`, never `optionId`: card ids are round-local, and this entry answers one standing question — which concept the novel is.
    payload: { cardId: card.id, title, engine: card.engine, hook: card.hook, fromAuthor: card.fromAuthor === true },
  };
}

function killedEntry(card: ConceptCardOption, killed: ConceptKilled): PlannedLedgerEntry {
  return { kind: 'rejected', topic: CONCEPTS_KILLED_TOPIC, statement: `${card.title} — ${card.logline}`, why: killed.reason.trim() };
}

function renderShown(options: ConceptsOptions): string {
  const cards = options.cards.map(card => `- ${card.title} — engine: ${card.engine}`);
  return `Cards the author is looking at right now. A new round is a new set: never offer any of these again, renamed, reworded or resworn to a different title.\n${cards.join('\n')}`;
}

export const conceptsStep: ScreenStep<BlueprintConceptsOutput, ConceptsOptions, never, ConceptsSelection> = {
  kind: 'screen',
  key: 'concepts',
  phase: 'idea',
  required: false,
  completionTopics: [CONCEPTS_TOPIC],
  nudges: ['More grounded', 'Darker', 'Stranger', 'Smaller scale', 'Surprise me'],
  prompt: blueprintConceptsPrompt,
  optionsSchema: ConceptsOptions,
  selectionSchema: ConceptsSelection,

  inputs(context: StepInputContext<ConceptsOptions>): Promise<BlueprintInputSection[]> {
    const shown = context.previous?.cards.length ? renderShown(context.previous) : '';
    return Promise.resolve(shown ? [{ key: 'already_shown', content: shown }] : []);
  },

  toRound(output) {
    return { options: { cards: output.cards.map(asCard) }, coachMessage: output.coachMessage.trim() };
  },

  describeOptions(options) {
    return options.cards.map(card => ({ id: card.id, label: `${card.title} — ${card.logline}` }));
  },

  chosenOptionIds(selection) {
    return [selection.kept.optionId, ...(selection.killed ?? []).map(killed => killed.optionId)];
  },

  async materialise(selection, { round, ledger }) {
    if (!round) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'there are no concepts to keep yet' });
    const cards = new Map(round.options.cards.map(card => [card.id, card]));
    const kept = cards.get(selection.kept.optionId);
    if (!kept) throw AppErrorCode.BPR_005.create({ optionId: selection.kept.optionId });

    const killed = (selection.killed ?? []).filter(item => item.optionId !== selection.kept.optionId);
    const seen = new Set<string>();
    const entries = [keptEntry(kept, selection.kept)];
    for (const item of killed) {
      const card = cards.get(item.optionId);
      if (!card || seen.has(card.id)) continue;
      seen.add(card.id);
      entries.push(killedEntry(card, item));
    }
    return { entries: withoutKnownRejections(entries, ledger), replaces: [CONCEPTS_TOPIC] };
  },
};
