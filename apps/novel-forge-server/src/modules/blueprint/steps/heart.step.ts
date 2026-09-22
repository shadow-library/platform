import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';

import { blueprintHeartPrompt } from '../../ai/prompts/blueprint-heart.prompt';
import { type BlueprintHeartOutput, HEART_CAUTION_MAX, HEART_TEXT_MAX, HEART_WHY_MAX, HEART_WRITER_LINE_MAX } from '../../ai/schemas/blueprint-heart.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type PlannedLedgerEntry, type ScreenStep } from '../engine/blueprint-step.types';
import { loadPageBody, type PageRef, upsertPageSections } from './bible-page';
import { PREMISE_PAGE } from './premise.step';

export const THEME_TOPIC = 'theme';
export const ENDING_TOPIC = 'ending';
export const HEART_REJECTED_MAX = 8;

const THEME_HEADING = 'Theme';
const ENDING_HEADING = 'The ending question';

@Schema()
export class HeartOption {
  @Field({ pattern: '^(t|e)[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: HEART_TEXT_MAX })
  text: string;

  @Field({ minLength: 1, maxLength: HEART_WHY_MAX })
  why: string;

  @Field({ optional: true, maxLength: HEART_CAUTION_MAX, description: 'What the coach says is weaker about this option; absent when nothing is.' })
  caution?: string;

  @Field({ minLength: 1, maxLength: HEART_WRITER_LINE_MAX })
  writerLine: string;
}

@Schema()
export class HeartOptions {
  @Field(() => [HeartOption])
  themes: HeartOption[];

  @Field(() => [HeartOption])
  endings: HeartOption[];
}

@Schema()
export class HeartAnswer {
  @Field({ optional: true, pattern: '^(t|e)[0-9]+$', description: 'The option the text came from; absent when the author wrote their own.' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: HEART_TEXT_MAX })
  text: string;

  @Field({ optional: true, maxLength: HEART_WHY_MAX })
  why?: string;

  @Field({
    minLength: 1,
    maxLength: HEART_WRITER_LINE_MAX,
    description: 'What it means for whoever writes chapter one. It rides every chapter pack, so it belongs to the answer being locked, not to one passed over.',
  })
  writerLine: string;
}

@Schema()
export class HeartSelection {
  @Field(() => HeartAnswer, { description: 'The question under the plot. An identity decision: chosen from the options or written in the author’s own words.' })
  theme: HeartAnswer;

  @Field(() => HeartAnswer, { description: 'What the reader waits the whole novel to learn.' })
  ending: HeartAnswer;
}

function asOptions(items: BlueprintHeartOutput['themes'] | BlueprintHeartOutput['endings'], prefix: 't' | 'e'): HeartOption[] {
  return items.map((item, index) => ({
    id: `${prefix}${index + 1}`,
    text: item.text.trim(),
    why: item.why.trim(),
    ...(item.caution?.trim() ? { caution: item.caution.trim() } : {}),
    writerLine: item.writerLine.trim(),
  }));
}

const normalise = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

function passedOver(offered: HeartOption[], chosen: string): string[] {
  return offered
    .map(option => option.text)
    .filter(text => normalise(text) !== normalise(chosen))
    .slice(0, HEART_REJECTED_MAX);
}

/**
 * `choiceId`, never `optionId`: option ids are round-local, and each of these two entries answers one standing question with one
 * answer chain, so a re-lock must pair them by topic rather than by which option happened to be offered where.
 */
function decision(topic: string, answer: HeartAnswer, offered: HeartOption[], page: PageRef): PlannedLedgerEntry {
  const text = answer.text.trim();
  const chosen = answer.optionId ? offered.find(option => option.id === answer.optionId) : undefined;
  return {
    kind: 'decision',
    topic,
    statement: text,
    why: answer.why?.trim() || chosen?.why || null,
    writerLine: answer.writerLine.trim(),
    rejectedAlternatives: passedOver(offered, text),
    payload: { ...(answer.optionId ? { choiceId: answer.optionId } : {}), ownWords: answer.optionId === undefined },
    links: { bibleDocuments: [page] },
  };
}

function assertAnswer(answer: HeartAnswer, what: string): void {
  if (!answer.text.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `the ${what} is empty` });
  if (!answer.writerLine.trim()) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `say what the ${what} means for whoever writes chapter one` });
}

function sectionBody(answer: HeartAnswer): string {
  const why = answer.why?.trim();
  return [answer.text.trim(), why ? `*${why}*` : null, `**Means for the writer:** ${answer.writerLine.trim()}`].filter(Boolean).join('\n\n');
}

export const heartStep: ScreenStep<BlueprintHeartOutput, HeartOptions, never, HeartSelection> = {
  kind: 'screen',
  key: 'heart',
  phase: 'heart',
  required: true,
  completionTopics: [THEME_TOPIC, ENDING_TOPIC],
  nudges: ['Bittersweet', 'Hopeful', 'Tragic', 'Ambiguous', 'Less abstract'],
  prompt: blueprintHeartPrompt,
  optionsSchema: HeartOptions,
  selectionSchema: HeartSelection,

  toRound(output) {
    return { options: { themes: asOptions(output.themes, 't'), endings: asOptions(output.endings, 'e') }, coachMessage: output.coachMessage.trim() };
  },

  describeOptions(options) {
    return [...options.themes, ...options.endings].map(option => ({ id: option.id, label: option.text }));
  },

  chosenOptionIds(selection) {
    return [selection.theme.optionId, selection.ending.optionId].filter((id): id is string => id !== undefined);
  },

  /** The theme and the ending question extend the premise page rather than replacing it: the premise step owns its own sections there. */
  async materialise(selection, { round, project, tx }) {
    assertAnswer(selection.theme, 'theme');
    assertAnswer(selection.ending, 'ending question');

    const offered = round?.options ?? { themes: [], endings: [] };
    const current = await loadPageBody(tx, project.id, PREMISE_PAGE);
    const body = upsertPageSections(current, 'Premise', null, [
      { heading: THEME_HEADING, body: sectionBody(selection.theme) },
      { heading: ENDING_HEADING, body: sectionBody(selection.ending) },
    ]);
    const changeSet: ContentOp[] = [{ op: 'bible_document.upsert', ...PREMISE_PAGE, body }];

    const plan: LockPlan = {
      entries: [decision(THEME_TOPIC, selection.theme, offered.themes, PREMISE_PAGE), decision(ENDING_TOPIC, selection.ending, offered.endings, PREMISE_PAGE)],
      changeSet,
      summary: 'Blueprint: the theme and the ending question',
    };
    return plan;
  },
};
