import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';
import {
  isPromiseDriver,
  PROMISE_DRIVER_LABELS,
  PROMISE_DRIVERS,
  PROMISE_DRIVERS_MAX,
  PROMISE_LENGTH_LABELS,
  PROMISE_LENGTHS,
  type PromiseDriver,
  type PromiseLength,
} from '@server/common';
import { type Bible } from '@server/database';

import { blueprintPromisePrompt } from '../../ai/prompts/blueprint-promise.prompt';
import {
  type BlueprintPromiseOutput,
  PROMISE_FIT_MAX,
  PROMISE_NOTE_MAX,
  PROMISE_TEXT_MAX,
  PROMISE_TONE_MAX,
  PROMISE_TONES_MAX,
  PROMISE_WRITER_LINE_MAX,
  PROMISES_MAX,
  PROMISES_MIN,
} from '../../ai/schemas/blueprint-promise.schema';
import { type ContentOp } from '../../refinement/change-set';
import { type LockPlan, type ScreenStep } from '../engine/blueprint-step.types';
import { PROMISE_TAILORING, promiseEffects, READER_PROMISE_TOPIC } from '../stage/promise-tailoring';
import { loadPageBody, upsertPageSections } from './bible-page';

export const PROMISE_TOPIC = READER_PROMISE_TOPIC;
export const PROMISE_PAGE: { section: Bible.Section; slug: string } = { section: 'project', slug: 'reader-promise' };
export const PROMISE_WHY_MAX = 400;

@Schema()
export class PromiseDriverOption {
  @Field(() => String, { enum: [...PROMISE_DRIVERS] })
  id: PromiseDriver;

  @Field({ minLength: 1 })
  label: string;

  @Field({ minLength: 1, maxLength: PROMISE_FIT_MAX })
  fit: string;

  @Field({ optional: true })
  recommended?: boolean;
}

@Schema()
export class PromiseLengthOption {
  @Field(() => String, { enum: [...PROMISE_LENGTHS] })
  id: PromiseLength;

  @Field({ minLength: 1 })
  label: string;

  @Field({ minLength: 1, maxLength: PROMISE_NOTE_MAX })
  note: string;
}

@Schema()
export class PromiseToneOption {
  @Field({ pattern: '^tn[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: PROMISE_TONE_MAX })
  label: string;

  @Field({ minLength: 1, maxLength: PROMISE_NOTE_MAX })
  note: string;
}

@Schema()
export class PromiseTextOption {
  @Field({ pattern: '^pr[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: PROMISE_TEXT_MAX })
  text: string;
}

@Schema()
export class PromiseTailoringOption {
  @Field({ minLength: 1 })
  id: string;

  @Field(() => String, { enum: [...PROMISE_DRIVERS] })
  driver: PromiseDriver;

  @Field(() => String, { enum: ['present', 'absent'], description: 'Whether the effect follows from choosing the driver or from leaving it out.' })
  when: 'present' | 'absent';

  @Field({ minLength: 1 })
  effect: string;
}

@Schema()
export class PromiseOptions {
  @Field(() => [PromiseDriverOption], { maxItems: PROMISE_DRIVERS.length })
  drivers: PromiseDriverOption[];

  @Field(() => [PromiseLengthOption], { maxItems: PROMISE_LENGTHS.length })
  lengths: PromiseLengthOption[];

  @Field(() => [PromiseToneOption], { maxItems: PROMISE_TONES_MAX })
  tones: PromiseToneOption[];

  @Field(() => [PromiseTextOption], { maxItems: PROMISES_MAX })
  promises: PromiseTextOption[];

  @Field(() => [PromiseTailoringOption], {
    description: 'What each driver changes in the phases below, sent so the screen states the consequences from the same rules the later steps read.',
  })
  tailoring: PromiseTailoringOption[];

  @Field({
    minLength: 1,
    maxLength: PROMISE_WRITER_LINE_MAX,
    description: 'The coach’s line for the promise it recommends; the screen offers it as a starting point, never as the answer.',
  })
  writerLine: string;
}

@Schema()
export class PromiseSelectedText {
  @Field({ optional: true, pattern: '^pr[0-9]+$', description: 'The promise the text came from; absent when the author wrote their own.' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: PROMISE_TEXT_MAX })
  text: string;
}

@Schema()
export class PromiseSelection {
  @Field(() => [String], {
    minItems: 1,
    maxItems: PROMISE_DRIVERS_MAX,
    description: `What drives the story, from ${PROMISE_DRIVERS.join(', ')}. Every later phase tailors itself to these, so they are the author’s own choice.`,
  })
  drivers: string[];

  @Field(() => String, { enum: [...PROMISE_LENGTHS] })
  length: PromiseLength;

  @Field({ minLength: 1, maxLength: PROMISE_TONE_MAX, description: 'The tone in the author’s words, whether or not it came from an offered one.' })
  tone: string;

  @Field({ optional: true, pattern: '^tn[0-9]+$' })
  toneOptionId?: string;

  @Field(() => [PromiseSelectedText], { minItems: PROMISES_MIN, maxItems: PROMISES_MAX, description: 'What every chapter owes the reader, as the author edited them.' })
  promises: PromiseSelectedText[];

  @Field({ optional: true, maxLength: PROMISE_WHY_MAX })
  why?: string;

  @Field({ minLength: 1, maxLength: PROMISE_WRITER_LINE_MAX, description: 'What the promise means for whoever writes chapter one; it rides every chapter pack.' })
  writerLine: string;
}

function asDrivers(output: BlueprintPromiseOutput): PromiseDriverOption[] {
  const said = new Map(output.drivers.map(driver => [driver.id, driver]));
  return PROMISE_DRIVERS.map(id => {
    const driver = said.get(id);
    return {
      id,
      label: PROMISE_DRIVER_LABELS[id],
      fit: driver?.fit.trim() || `What ${PROMISE_DRIVER_LABELS[id].toLowerCase()} would mean here was not said this round.`,
      ...(driver?.recommended === true ? { recommended: true } : {}),
    };
  });
}

function asLengths(output: BlueprintPromiseOutput): PromiseLengthOption[] {
  const said = new Map(output.lengths.map(length => [length.id, length]));
  return PROMISE_LENGTHS.map(id => ({
    id,
    label: PROMISE_LENGTH_LABELS[id],
    note: said.get(id)?.note.trim() || 'Sets the volume count and the pacing; the spine rescales if you change it.',
  }));
}

const TAILORING_OPTIONS: PromiseTailoringOption[] = PROMISE_TAILORING.map(rule => ({ id: rule.id, driver: rule.driver, when: rule.when, effect: rule.effect }));

function promiseStatement(drivers: string[], length: PromiseLength, tone: string): string {
  const named = drivers.map(driver => (isPromiseDriver(driver) ? PROMISE_DRIVER_LABELS[driver] : driver)).join(' and ');
  return `${named}, ${PROMISE_LENGTH_LABELS[length]}, ${tone}`;
}

function promisePage(current: string | null, selection: PromiseSelection, drivers: string[], tone: string, promises: string[]): string {
  const effects = promiseEffects(drivers).map(rule => `- ${rule.effect}`);
  return upsertPageSections(current, 'Reader promise', promiseStatement(drivers, selection.length, tone), [
    { heading: 'Promises to the reader', body: promises.map(promise => `- ${promise}`).join('\n') },
    { heading: 'What it changes', body: effects.join('\n') },
    { heading: 'Why', body: selection.why?.trim() ?? '' },
    { heading: 'What it means for the writer', body: selection.writerLine.trim() },
  ]);
}

export const promiseStep: ScreenStep<BlueprintPromiseOutput, PromiseOptions, never, PromiseSelection> = {
  kind: 'screen',
  key: 'promise',
  phase: 'heart',
  required: true,
  completionTopics: [PROMISE_TOPIC],
  nudges: ['Gentler stakes', 'Higher stakes', 'Shorter novel', 'More romance', 'Less romance'],
  prompt: blueprintPromisePrompt,
  optionsSchema: PromiseOptions,
  selectionSchema: PromiseSelection,

  toRound(output) {
    return {
      options: {
        drivers: asDrivers(output),
        lengths: asLengths(output),
        tones: output.tones.map((tone, index) => ({ id: `tn${index + 1}`, label: tone.label.trim(), note: tone.note.trim() })),
        promises: output.promises.map((text, index) => ({ id: `pr${index + 1}`, text: text.trim() })),
        tailoring: TAILORING_OPTIONS,
        writerLine: output.writerLine.trim(),
      },
      coachMessage: output.coachMessage.trim(),
    };
  },

  describeOptions(options) {
    return [
      ...options.drivers.map(driver => ({ id: driver.id, label: driver.label })),
      ...options.lengths.map(length => ({ id: length.id, label: length.label })),
      ...options.tones.map(tone => ({ id: tone.id, label: tone.label })),
      ...options.promises.map(promise => ({ id: promise.id, label: promise.text })),
    ];
  },

  chosenOptionIds(selection) {
    return [
      ...selection.drivers,
      selection.length,
      ...(selection.toneOptionId ? [selection.toneOptionId] : []),
      ...selection.promises.flatMap(promise => (promise.optionId ? [promise.optionId] : [])),
    ];
  },

  /** One decision, and its payload is the tailoring contract every later phase reads — the driver ids are the stable part of it. */
  async materialise(selection, { project, tx }) {
    const drivers = [...new Set(selection.drivers)];
    const unknown = drivers.find(driver => !isPromiseDriver(driver));
    if (unknown !== undefined) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `“${unknown}” is not a story driver` });
    if (drivers.length === 0) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'pick at least one driver' });
    const tone = selection.tone.trim();
    if (!tone) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'the tone is empty' });
    const writerLine = selection.writerLine.trim();
    if (!writerLine) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'say what the promise means for whoever writes chapter one' });

    const promises = [...new Set(selection.promises.map(promise => promise.text.trim()).filter(Boolean))];
    if (promises.length < PROMISES_MIN) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `write at least ${PROMISES_MIN} promises to the reader` });

    const current = await loadPageBody(tx, project.id, PROMISE_PAGE);
    const changeSet: ContentOp[] = [{ op: 'bible_document.upsert', ...PROMISE_PAGE, body: promisePage(current, selection, drivers, tone, promises) }];

    const plan: LockPlan = {
      entries: [
        {
          kind: 'decision',
          topic: PROMISE_TOPIC,
          statement: promiseStatement(drivers, selection.length, tone),
          why: selection.why?.trim() || null,
          writerLine,
          payload: { drivers, length: selection.length, tone, promises },
          links: { bibleDocuments: [PROMISE_PAGE] },
        },
      ],
      changeSet,
      summary: 'Blueprint: the reader promise',
    };
    return plan;
  },
};
