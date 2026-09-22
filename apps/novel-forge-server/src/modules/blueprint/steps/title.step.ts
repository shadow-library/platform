import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';

import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { blueprintTitlePrompt } from '../../ai/prompts/blueprint-title.prompt';
import { type BlueprintTitleOutput, TITLE_FROM_MAX, TITLE_STYLE_LABELS, TITLE_STYLES, TITLE_TEXT_MAX, type TitleStyle } from '../../ai/schemas/blueprint-title.schema';
import { type ContentOp } from '../../refinement/change-set';
import { withoutKnownRejections } from '../engine/blueprint-round';
import { type PlannedLedgerEntry, type ScreenStep, type StepInputContext } from '../engine/blueprint-step.types';

export const TITLE_TOPIC = 'title';
/**
 * A title the author refused is a standing statement about their novel, not an answer they can be asked for again, so it lives
 * outside the topics a lock replaces. The name is one `rejectedTopic(step)` cannot produce, so a lock's rejections never share a
 * topic with the ones steering writes.
 */
export const TITLE_RULED_OUT_TOPIC = 'title.ruled_out';
export const TITLE_REJECT_REASON_MAX = 300;
export const TITLE_SHORTLIST_MAX = 5;
export const TITLE_REJECTED_MAX = 10;

@Schema()
export class TitleCandidateOption {
  @Field({ pattern: '^t[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: TITLE_TEXT_MAX })
  text: string;

  @Field({ minLength: 1, maxLength: TITLE_FROM_MAX, description: 'The decision it came from, as the author would recognise it.' })
  from: string;
}

@Schema()
export class TitleGroupOption {
  @Field(() => String, { enum: [...TITLE_STYLES] })
  style: TitleStyle;

  @Field({ minLength: 1 })
  label: string;

  @Field(() => [TitleCandidateOption])
  titles: TitleCandidateOption[];
}

@Schema()
export class TitleOptions {
  @Field(() => [TitleGroupOption])
  groups: TitleGroupOption[];
}

@Schema()
export class TitleWorking {
  @Field({ optional: true, pattern: '^t[0-9]+$', description: 'The candidate it came from; absent when the author wrote their own.' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: TITLE_TEXT_MAX })
  text: string;
}

@Schema()
export class TitleRejected {
  @Field({ pattern: '^t[0-9]+$' })
  optionId: string;

  @Field({ minLength: 1, maxLength: TITLE_REJECT_REASON_MAX, description: 'The author’s reason; it is what stops a later round proposing the same title again.' })
  reason: string;
}

@Schema()
export class TitleSelection {
  @Field(() => TitleWorking, { description: 'The working title. It is asked again after the first chapters and before first publish.' })
  working: TitleWorking;

  @Field(() => [String], {
    optional: true,
    maxItems: TITLE_SHORTLIST_MAX,
    description: 'Titles the author starred but did not take; they ride the decision, not their own entries.',
  })
  shortlist?: string[];

  @Field(() => [TitleRejected], { optional: true, maxItems: TITLE_REJECTED_MAX })
  rejected?: TitleRejected[];

  @Field({ optional: true, maxLength: 400 })
  why?: string;
}

function asGroups(output: BlueprintTitleOutput): TitleGroupOption[] {
  let counter = 0;
  return output.groups.map(group => ({
    style: group.style as TitleStyle,
    label: TITLE_STYLE_LABELS[group.style as TitleStyle] ?? group.style,
    titles: group.titles.map(title => ({ id: `t${++counter}`, text: title.text.trim(), from: title.from.trim() })),
  }));
}

function candidates(options: TitleOptions): TitleCandidateOption[] {
  return options.groups.flatMap(group => group.titles);
}

const normalise = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

function renderShown(options: TitleOptions, project: { title: string | null }): string {
  const shown = candidates(options).map(title => `- ${title.text}`);
  const blocks = [
    shown.length > 0 ? `Titles already on the author's screen. A new round is a new set: never offer any of these again, respaced or repunctuated.\n${shown.join('\n')}` : null,
    project.title ? `The novel's current working title is “${project.title}”. Offer better, not the same.` : null,
  ].filter((block): block is string => block !== null);
  return blocks.join('\n\n');
}

function rejectedEntry(candidate: TitleCandidateOption, rejected: TitleRejected): PlannedLedgerEntry {
  return { kind: 'rejected', topic: TITLE_RULED_OUT_TOPIC, statement: candidate.text, why: rejected.reason.trim() };
}

export const titleStep: ScreenStep<BlueprintTitleOutput, TitleOptions, never, TitleSelection> = {
  kind: 'screen',
  key: 'title',
  phase: 'heart',
  required: false,
  completionTopics: [TITLE_TOPIC],
  nudges: ['Shorter', 'More descriptive', 'Title and subtitle', 'Plainer words'],
  prompt: blueprintTitlePrompt,
  optionsSchema: TitleOptions,
  selectionSchema: TitleSelection,

  inputs(context: StepInputContext<TitleOptions>): Promise<BlueprintInputSection[]> {
    const shown = context.previous ? renderShown(context.previous, context.project) : '';
    return Promise.resolve(shown ? [{ key: 'already_shown', content: shown }] : []);
  },

  toRound(output) {
    return { options: { groups: asGroups(output) }, coachMessage: output.coachMessage.trim() };
  },

  describeOptions(options) {
    return candidates(options).map(title => ({ id: title.id, label: title.text }));
  },

  chosenOptionIds(selection) {
    return [...(selection.working.optionId ? [selection.working.optionId] : []), ...(selection.rejected ?? []).map(rejected => rejected.optionId)];
  },

  /** The working title is one decision on one topic; the titles the author refused are permanent and live on their own. */
  async materialise(selection, { round, ledger }) {
    const text = selection.working.text.trim();
    if (!text) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'the working title is empty' });

    const offered = round ? candidates(round.options) : [];
    const byId = new Map(offered.map(title => [title.id, title]));
    const chosen = selection.working.optionId ? byId.get(selection.working.optionId) : undefined;
    const shortlist = [...new Set((selection.shortlist ?? []).map(title => title.trim()).filter(candidate => candidate && normalise(candidate) !== normalise(text)))];

    const seen = new Set<string>();
    const refused: PlannedLedgerEntry[] = [];
    for (const item of selection.rejected ?? []) {
      const candidate = byId.get(item.optionId);
      if (!candidate || seen.has(candidate.id) || normalise(candidate.text) === normalise(text)) continue;
      seen.add(candidate.id);
      refused.push(rejectedEntry(candidate, item));
    }

    const changeSet: ContentOp[] = [{ op: 'premise.update', title: text }];
    return {
      entries: [
        {
          kind: 'decision',
          topic: TITLE_TOPIC,
          statement: text,
          why: selection.why?.trim() || (chosen ? `From ${chosen.from}.` : null),
          writerLine: null,
          rejectedAlternatives: offered
            .map(title => title.text)
            .filter(candidate => normalise(candidate) !== normalise(text))
            .slice(0, TITLE_REJECTED_MAX),
          payload: { ...(chosen ? { choiceId: chosen.id, from: chosen.from } : {}), ownWords: chosen === undefined, ...(shortlist.length > 0 ? { shortlist } : {}) },
        },
        ...withoutKnownRejections(refused, ledger),
      ],
      changeSet,
      summary: 'Blueprint: the working title',
      replaces: [TITLE_TOPIC],
    };
  },
};
