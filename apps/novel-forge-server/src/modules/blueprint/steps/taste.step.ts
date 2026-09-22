import { Field, Schema } from '@shadow-library/class-schema';

import { AppErrorCode } from '@server/classes';

import { type BlueprintInputSection } from '../../ai/context/blueprint-sections';
import { blueprintTastePrompt } from '../../ai/prompts/blueprint-taste.prompt';
import { type BlueprintTasteOutput, TASTE_LABEL_MAX, TASTE_PAIR_MAX, TASTE_REASON_MAX, TASTE_REASONS_MAX, TASTE_SIDE_TEXT_MAX } from '../../ai/schemas/blueprint-taste.schema';
import { withoutKnownRejections } from '../engine/blueprint-round';
import { type PlannedLedgerEntry, type ScreenStep, type StepInputContext } from '../engine/blueprint-step.types';

export const TASTE_TOPIC = 'taste';
/**
 * Why the author has put a book down: a standing statement about them, not an answer to a question they can be asked again, so it
 * lives outside the topics a lock replaces. The name is one `rejectedTopic(step)` cannot produce, so a lock's rejections never share
 * a topic with the ones steering writes. A pair answered "neither" is an answer, and stays on `taste` where re-answering retires it.
 */
export const TASTE_GAVE_UP_TOPIC = 'taste.gave_up';
export const TASTE_VERDICTS = ['a', 'b', 'both', 'neither', 'depends'] as const;
export const TASTE_NOTE_MAX = 300;
export const TASTE_OWN_REASONS_MAX = 5;

export type TasteVerdictValue = (typeof TASTE_VERDICTS)[number];

@Schema()
export class TasteSideOption {
  @Field({ minLength: 1, maxLength: TASTE_SIDE_TEXT_MAX })
  text: string;

  @Field({ minLength: 1, maxLength: TASTE_LABEL_MAX })
  label: string;
}

@Schema()
export class TastePairOption {
  @Field({ pattern: '^p[0-9]+$' })
  id: string;

  @Field(() => TasteSideOption)
  a: TasteSideOption;

  @Field(() => TasteSideOption)
  b: TasteSideOption;
}

@Schema()
export class TasteReasonOption {
  @Field({ pattern: '^r[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: TASTE_REASON_MAX })
  label: string;
}

@Schema()
export class TasteOptions {
  @Field(() => [TastePairOption], { maxItems: TASTE_PAIR_MAX })
  pairs: TastePairOption[];

  @Field(() => [TasteReasonOption], { maxItems: TASTE_REASONS_MAX })
  giveUpReasons: TasteReasonOption[];
}

@Schema()
export class TastePairVerdict {
  @Field({ pattern: '^p[0-9]+$' })
  optionId: string;

  @Field(() => String, {
    enum: [...TASTE_VERDICTS],
    description: 'Which side the author would rather read, or `both`, `neither`, or `depends` with a note explaining what it depends on.',
  })
  verdict: TasteVerdictValue;

  @Field({ optional: true, maxLength: TASTE_NOTE_MAX, description: 'Required on `depends`: the author’s own words, saved as the taste line.' })
  note?: string;
}

@Schema()
export class TasteSelection {
  @Field(() => [TastePairVerdict], { maxItems: TASTE_PAIR_MAX, description: 'One verdict per pair the author answered; unanswered pairs are simply absent.' })
  verdicts: TastePairVerdict[];

  @Field(() => [String], { optional: true, maxItems: TASTE_REASONS_MAX, description: 'The offered give-up reasons the author recognised.' })
  reasonIds?: string[];

  @Field(() => [String], { optional: true, maxItems: TASTE_OWN_REASONS_MAX, description: 'Give-up reasons the author typed themselves.' })
  ownReasons?: string[];
}

function pairLabel(pair: TastePairOption): string {
  return `${pair.a.label} or ${pair.b.label}`;
}

function asPair(pair: { a: TasteSideOption; b: TasteSideOption }, id: string): TastePairOption {
  return { id, a: { text: pair.a.text.trim(), label: pair.a.label.trim() }, b: { text: pair.b.text.trim(), label: pair.b.label.trim() } };
}

const normalise = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const pairKey = (pair: { a: { text: string }; b: { text: string } }): string => [normalise(pair.a.text), normalise(pair.b.text)].sort().join(' | ');

/** A round adds pairs rather than replacing them, so answers already given on screen survive the next round. */
function mergePairs(previous: TastePairOption[], fresh: BlueprintTasteOutput['pairs']): TastePairOption[] {
  const seen = new Set(previous.map(pairKey));
  const merged = [...previous];
  for (const pair of fresh) {
    if (merged.length >= TASTE_PAIR_MAX || seen.has(pairKey(pair))) continue;
    seen.add(pairKey(pair));
    merged.push(asPair(pair, `p${merged.length + 1}`));
  }
  return merged;
}

function mergeReasons(previous: TasteReasonOption[], fresh: string[]): TasteReasonOption[] {
  const seen = new Set(previous.map(reason => normalise(reason.label)));
  const merged = [...previous];
  for (const label of fresh) {
    const trimmed = label.trim().slice(0, TASTE_REASON_MAX);
    if (!trimmed || merged.length >= TASTE_REASONS_MAX || seen.has(normalise(trimmed))) continue;
    seen.add(normalise(trimmed));
    merged.push({ id: `r${merged.length + 1}`, label: trimmed });
  }
  return merged;
}

function renderAsked(options: TasteOptions): string {
  const pairs = options.pairs.map(pair => `- ${pair.a.text} — OR — ${pair.b.text}`);
  const reasons = options.giveUpReasons.map(reason => `- ${reason.label}`);
  const blocks = [
    pairs.length > 0 ? `Pairs already asked (never ask any of these again):\n${pairs.join('\n')}` : null,
    reasons.length > 0 ? `Give-up reasons already offered:\n${reasons.join('\n')}` : null,
  ].filter((block): block is string => block !== null);
  return blocks.join('\n\n');
}

function verdictEntries(pair: TastePairOption, verdict: TastePairVerdict): PlannedLedgerEntry[] {
  const { a, b } = pair;
  // The pair, not the side, is the option: one question keeps one answer, so changing a verdict supersedes it rather than adding a second.
  const chose = (statement: string, why: string): PlannedLedgerEntry => ({
    kind: 'direction',
    topic: TASTE_TOPIC,
    statement,
    why,
    payload: { optionId: pair.id, verdict: verdict.verdict },
  });

  switch (verdict.verdict) {
    case 'a':
      return [chose(a.label, `Would rather read “${a.text}” than “${b.text}”.`)];
    case 'b':
      return [chose(b.label, `Would rather read “${b.text}” than “${a.text}”.`)];
    case 'both':
      return [chose(`${a.label} and ${b.label}`, `Wants both “${a.text}” and “${b.text}”.`)];
    case 'neither':
      return (['a', 'b'] as const).map(side => ({
        kind: 'rejected',
        topic: TASTE_TOPIC,
        statement: pair[side].label,
        why: `Would read neither side of “${pairLabel(pair)}”.`,
        payload: { optionId: pair.id, verdict: 'neither', side },
      }));
    default: {
      const note = verdict.note?.trim();
      if (!note) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: `“${pairLabel(pair)}” is answered with “depends” but says what it depends on nowhere` });
      return [chose(note, `On “${pairLabel(pair)}”.`)];
    }
  }
}

function reasonEntries(selection: TasteSelection, offered: TasteReasonOption[]): PlannedLedgerEntry[] {
  const why = 'A reason the author has put a book down.';
  const byId = new Map(offered.map(reason => [reason.id, reason]));
  const chosen = [...new Set(selection.reasonIds ?? [])].flatMap(id => {
    const reason = byId.get(id);
    return reason ? [{ kind: 'rejected' as const, topic: TASTE_GAVE_UP_TOPIC, statement: reason.label, why, payload: { optionId: reason.id, verdict: 'gave_up' } }] : [];
  });
  const written = [...new Set((selection.ownReasons ?? []).map(reason => reason.trim()).filter(Boolean))]
    .slice(0, TASTE_OWN_REASONS_MAX)
    .map(statement => ({ kind: 'rejected' as const, topic: TASTE_GAVE_UP_TOPIC, statement: statement.slice(0, TASTE_REASON_MAX), why }));
  return [...chosen, ...written];
}

export const tasteStep: ScreenStep<BlueprintTasteOutput, TasteOptions, never, TasteSelection> = {
  kind: 'screen',
  key: 'taste',
  phase: 'idea',
  required: false,
  completionTopics: [TASTE_TOPIC, TASTE_GAVE_UP_TOPIC],
  nudges: ['Ask about romance', 'Ask about pacing', 'Ask about mentors', 'Ask about how it ends'],
  prompt: blueprintTastePrompt,
  optionsSchema: TasteOptions,
  selectionSchema: TasteSelection,

  inputs(context: StepInputContext<TasteOptions>): Promise<BlueprintInputSection[]> {
    const asked = context.previous ? renderAsked(context.previous) : '';
    return Promise.resolve(asked ? [{ key: 'taste_asked', content: asked }] : []);
  },

  toRound(output, { previous }) {
    const pairs = mergePairs(previous?.pairs ?? [], output.pairs);
    const giveUpReasons = mergeReasons(previous?.giveUpReasons ?? [], output.giveUpReasons);
    return { options: { pairs, giveUpReasons }, coachMessage: output.coachMessage.trim() };
  },

  describeOptions(options) {
    return [...options.pairs.map(pair => ({ id: pair.id, label: pairLabel(pair) })), ...options.giveUpReasons.map(reason => ({ id: reason.id, label: reason.label }))];
  },

  chosenOptionIds(selection) {
    return [...selection.verdicts.map(verdict => verdict.optionId), ...(selection.reasonIds ?? [])];
  },

  async materialise(selection, { round, ledger }) {
    if (!round) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'there are no taste pairs to answer yet' });
    const pairs = new Map(round.options.pairs.map(pair => [pair.id, pair]));
    const answered = selection.verdicts.flatMap(verdict => {
      const pair = pairs.get(verdict.optionId);
      return pair ? verdictEntries(pair, verdict) : [];
    });
    // Only the give-up reasons are deduped: they are permanent, so writing one twice would leave two. A pair's answer is replaced
    // by its own retirement, and skipping it because the ledger already holds it would retire the answer and put nothing back.
    const entries = [...answered, ...withoutKnownRejections(reasonEntries(selection, round.options.giveUpReasons), ledger)];
    if (entries.length === 0) throw AppErrorCode.BPR_004.create({ part: 'selection', issues: 'answer at least one pair or name one reason you gave up on a book' });
    // Every pair the lock answers is retired first, so re-answering one that was "neither" takes both its bans down with it.
    return { entries, replaces: [TASTE_TOPIC], retires: selection.verdicts.filter(verdict => pairs.has(verdict.optionId)).map(verdict => verdict.optionId) };
  },
};
