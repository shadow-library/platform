import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import { type Bible } from '@server/database';

import { blueprintPremisePrompt } from '../../ai/prompts/blueprint-premise.prompt';
import {
  type BlueprintPremiseOutput,
  PREMISE_ALTERNATIVES_MAX,
  PREMISE_PART_KINDS,
  PREMISE_PART_MAX,
  PREMISE_PART_TEXT_MAX,
  PREMISE_SENTENCE_MAX,
  PREMISE_WHY_MAX,
  PREMISE_WRITER_LINE_MAX,
  type PremisePartKind,
} from '../../ai/schemas/blueprint-premise.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type ScreenStep } from '../engine/blueprint-step.types';

export const PREMISE_TOPIC = 'premise';
export const PREMISE_PAGE: { section: Bible.Section; slug: string } = { section: 'project', slug: 'premise' };
export const PREMISE_REJECTED_MAX = 12;

@Schema()
export class PremiseAlternativeOption {
  @Field({ pattern: '^p[0-9]+_a[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: PREMISE_PART_TEXT_MAX })
  text: string;
}

@Schema()
export class PremisePartOption {
  @Field({ pattern: '^p[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: PREMISE_PART_TEXT_MAX })
  text: string;

  @Field(() => String, { enum: [...PREMISE_PART_KINDS] })
  kind: PremisePartKind;

  @Field(() => [PremiseAlternativeOption], { maxItems: PREMISE_ALTERNATIVES_MAX })
  alternatives: PremiseAlternativeOption[];
}

@Schema()
export class PremiseOptions {
  @Field(() => [PremisePartOption], { maxItems: PREMISE_PART_MAX })
  parts: PremisePartOption[];

  @Field({ minLength: 1, maxLength: PREMISE_WHY_MAX })
  why: string;

  @Field({ minLength: 1, maxLength: PREMISE_WRITER_LINE_MAX })
  writerLine: string;
}

@Schema()
export class PremiseCurrentPart {
  @Field({ pattern: '^p[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: PREMISE_PART_TEXT_MAX })
  text: string;
}

@Schema()
export class PremiseInput {
  @Field({ optional: true, pattern: '^p[0-9]+$', description: 'Rework the alternatives of this part alone; every other part is kept exactly as the author has it.' })
  part?: string;

  @Field(() => [PremiseCurrentPart], { optional: true, maxItems: PREMISE_PART_MAX, description: 'The sentence as it stands on the author’s screen, part by part.' })
  current?: PremiseCurrentPart[];
}

@Schema()
export class PremiseSelectedPart {
  @Field({ optional: true, pattern: '^p[0-9]+(_a[0-9]+)?$', description: 'The part or alternative the text came from; absent when the author wrote their own.' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: PREMISE_PART_TEXT_MAX })
  text: string;
}

@Schema()
export class PremiseSelection {
  @Field(() => [PremiseSelectedPart], { minItems: 1, maxItems: PREMISE_PART_MAX })
  parts: PremiseSelectedPart[];

  @Field({ minLength: 1, maxLength: PREMISE_SENTENCE_MAX, description: 'The assembled sentence, exactly as the author reads it on screen.' })
  sentence: string;

  @Field({ optional: true, maxLength: PREMISE_WHY_MAX })
  why?: string;

  @Field({
    minLength: 1,
    maxLength: PREMISE_WRITER_LINE_MAX,
    description:
      'What the premise means for whoever writes chapter one. It rides every chapter pack, so it is the author’s own line about the sentence they are locking, never a line left over from a sentence they discarded.',
  })
  writerLine: string;
}

const normalise = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

function asPart(part: BlueprintPremiseOutput['parts'][number], index: number): PremisePartOption {
  const id = `p${index + 1}`;
  return {
    id,
    text: part.text.trim(),
    kind: part.kind,
    alternatives: part.alternatives.map((text, at) => ({ id: `${id}_a${at + 1}`, text: text.trim() })),
  };
}

function currentTextOf(part: PremisePartOption, input: PremiseInput | null): string {
  return input?.current?.find(candidate => candidate.id === part.id)?.text.trim() || part.text;
}

function premiseBody(sentence: string, why: string | null, writerLine: string | null): string {
  const blocks = ['# Premise', sentence];
  if (why) blocks.push('## Why', why);
  if (writerLine) blocks.push('## What it means for the writer', writerLine);
  return blocks.join('\n\n');
}

function rejectedAlternatives(offered: PremiseOptions | null, chosen: Set<string>): string[] {
  if (!offered) return [];
  const passedOver = offered.parts.flatMap(part => [part.text, ...part.alternatives.map(alternative => alternative.text)]).filter(text => !chosen.has(normalise(text)));
  return [...new Set(passedOver)].slice(0, PREMISE_REJECTED_MAX);
}

export const premiseStep: ScreenStep<BlueprintPremiseOutput, PremiseOptions, PremiseInput, PremiseSelection> = {
  kind: 'screen',
  key: 'premise',
  phase: 'idea',
  required: true,
  completionTopics: [PREMISE_TOPIC],
  nudges: ['Shorter', 'Plainer words', 'Raise the stakes', 'More hopeful', 'Make it stranger'],
  prompt: blueprintPremisePrompt,
  optionsSchema: PremiseOptions,
  inputSchema: PremiseInput,
  selectionSchema: PremiseSelection,

  renderInput(input) {
    const current = input.current?.map(part => part.text.trim()).filter(Boolean) ?? [];
    const sentence = current.length > 0 ? `The sentence as the author has it now:\n${current.join(' ')}` : null;
    const target = input.part ? input.current?.find(part => part.id === input.part) : undefined;
    const focus = input.part
      ? `Rework only this part of it: “${target?.text.trim() ?? input.part}”. Offer fresh alternatives for that part alone and leave every other part exactly as it is.`
      : null;
    return [sentence, focus].filter(Boolean).join('\n\n') || null;
  },

  /** A part-focused round swaps that part's alternatives and nothing else, so opening one part never rewrites the author's sentence. */
  toRound(output, { previous, input }) {
    const coachMessage = output.coachMessage.trim();
    const fresh = { parts: output.parts.map(asPart), why: output.why.trim(), writerLine: output.writerLine.trim() };
    const focusIndex = input?.part ? (previous?.parts.findIndex(part => part.id === input.part) ?? -1) : -1;
    if (!previous || focusIndex < 0) return { options: fresh, coachMessage };

    // A model that returns a different number of parts has not reworked one part of this sentence, so nothing of it is trusted positionally.
    const reworked = fresh.parts.length === previous.parts.length ? fresh.parts[focusIndex] : undefined;
    const parts = previous.parts.map((part, index) => ({
      ...part,
      text: currentTextOf(part, input),
      ...(index === focusIndex && reworked ? { alternatives: reworked.alternatives.map((alternative, at) => ({ id: `${part.id}_a${at + 1}`, text: alternative.text })) } : {}),
    }));
    return { options: { parts, why: previous.why, writerLine: previous.writerLine }, coachMessage };
  },

  describeOptions(options) {
    return options.parts.flatMap(part => [{ id: part.id, label: part.text }, ...part.alternatives.map(alternative => ({ id: alternative.id, label: alternative.text }))]);
  },

  chosenOptionIds(selection) {
    return selection.parts.flatMap(part => (part.optionId ? [part.optionId] : []));
  },

  async materialise(selection, { round }) {
    const sentence = selection.sentence.trim();
    if (!sentence) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'the premise sentence is empty' });

    const offered = round?.options ?? null;
    const why = selection.why?.trim() || offered?.why || null;
    const writerLine = selection.writerLine.trim();
    if (!writerLine) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the premise means for whoever writes chapter one' });
    const chosen = new Set(selection.parts.map(part => normalise(part.text)));

    const changeSet: ContentOp[] = [
      { op: 'premise.update', premise: sentence },
      { op: 'bible_document.upsert', ...PREMISE_PAGE, body: premiseBody(sentence, why, writerLine) },
    ];
    const plan: LockPlan = {
      entries: [
        {
          kind: 'decision',
          topic: PREMISE_TOPIC,
          statement: sentence,
          why,
          writerLine,
          rejectedAlternatives: rejectedAlternatives(offered, chosen),
          payload: { parts: selection.parts.map(part => ({ ...(part.optionId ? { optionId: part.optionId } : {}), text: part.text.trim() })) },
          links: { bibleDocuments: [PREMISE_PAGE] },
        },
      ],
      changeSet,
      summary: 'Blueprint: the premise',
    };
    return plan;
  },
};
