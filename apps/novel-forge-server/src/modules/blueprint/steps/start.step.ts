import { Field, Schema } from '@shadow-library/class-schema';

import { blueprintStartPrompt } from '../../ai/prompts/blueprint-start.prompt';
import { type BlueprintStartOutput, START_CHIP_KINDS, START_CHIP_LABEL_MAX, START_CHIP_MAX, type StartChipKind } from '../../ai/schemas/blueprint-start.schema';
import { withoutKnownRejections } from '../engine/blueprint-round';
import { type PlannedLedgerEntry, type ScreenStep } from '../engine/blueprint-step.types';

export const STARTING_TYPES = ['book', 'character', 'world', 'scene', 'nothing'] as const;
export const START_TOPIC = 'start';
/**
 * What the author ruled out lives apart from what they meant, so a later reading of the same starting point can never retire it.
 * The name is deliberately one `rejectedTopic(step)` cannot produce: a lock's rejections never share a topic with steering ones.
 */
export const START_RULED_OUT_TOPIC = 'start.ruled_out';

export type StartingType = (typeof STARTING_TYPES)[number];

const STARTING_TYPE_LABELS: Record<StartingType, string> = {
  book: 'a book they love',
  character: 'a character',
  world: 'a world',
  scene: 'a single scene',
  nothing: 'nothing yet',
};

@Schema()
export class StartChipOption {
  @Field({ pattern: '^c[0-9]+$' })
  id: string;

  @Field({ minLength: 1, maxLength: START_CHIP_LABEL_MAX })
  label: string;

  @Field(() => String, { enum: [...START_CHIP_KINDS] })
  kind: StartChipKind;
}

@Schema()
export class StartOptions {
  @Field(() => [StartChipOption], { maxItems: START_CHIP_MAX })
  understood: StartChipOption[];
}

@Schema()
export class StartInput {
  @Field({ optional: true, maxLength: 4000, description: 'Whatever the author already imagines, in their own words; may be empty.' })
  text?: string;

  @Field(() => String, { optional: true, enum: [...STARTING_TYPES], description: 'What kind of starting point the text is.' })
  startingType?: StartingType;
}

@Schema()
export class StartSelectionChip {
  @Field({ optional: true, pattern: '^c[0-9]+$', description: 'The chip the author kept or edited; absent for a chip the author added.' })
  optionId?: string;

  @Field({ minLength: 1, maxLength: START_CHIP_LABEL_MAX })
  label: string;

  @Field(() => String, { enum: [...START_CHIP_KINDS] })
  kind: StartChipKind;
}

@Schema()
export class StartSelection {
  @Field(() => [StartSelectionChip], { minItems: 1, maxItems: START_CHIP_MAX, description: 'The corrected reading: the chips the author kept, edited or added.' })
  chips: StartSelectionChip[];
}

function toEntry(chip: StartSelectionChip): PlannedLedgerEntry {
  const payload = { kind: chip.kind, ...(chip.optionId ? { optionId: chip.optionId } : {}) };
  const ruledOut = chip.kind === 'not';
  return { kind: ruledOut ? 'rejected' : 'direction', topic: ruledOut ? START_RULED_OUT_TOPIC : START_TOPIC, statement: chip.label.trim(), payload };
}

export const startStep: ScreenStep<BlueprintStartOutput, StartOptions, StartInput, StartSelection> = {
  kind: 'screen',
  key: 'start',
  phase: 'idea',
  required: false,
  completionTopics: [START_TOPIC, START_RULED_OUT_TOPIC],
  nudges: ['Read it more literally', 'Look for the feeling', 'Fewer chips'],
  prompt: blueprintStartPrompt,
  optionsSchema: StartOptions,
  inputSchema: StartInput,
  selectionSchema: StartSelection,

  renderInput(input) {
    const text = input.text?.trim();
    const from = input.startingType ? `Starting from ${STARTING_TYPE_LABELS[input.startingType]}.` : null;
    return [from, text ? `In the author's words:\n${text}` : 'The author wrote nothing.'].filter(Boolean).join('\n\n');
  },

  toRound(output) {
    const understood = output.understood.map((chip, index) => ({ id: `c${index + 1}`, label: chip.label.trim(), kind: chip.kind }));
    return { options: { understood }, coachMessage: output.coachMessage.trim() };
  },

  describeOptions(options) {
    return options.understood.map(chip => ({ id: chip.id, label: chip.label }));
  },

  chosenOptionIds(selection) {
    return selection.chips.flatMap(chip => (chip.optionId ? [chip.optionId] : []));
  },

  /**
   * Every chip the round offered is retired, not only the ones the lock answers: a reading turned into "not" takes its old direction
   * down with it, and so does one the author simply deleted.
   */
  materialise(selection, { round, ledger }) {
    const offered = round?.options.understood.map(chip => chip.id) ?? [];
    const answered = selection.chips.flatMap(chip => (chip.optionId ? [chip.optionId] : []));
    return Promise.resolve({
      entries: withoutKnownRejections(selection.chips.map(toEntry), ledger),
      replaces: [START_TOPIC],
      retires: [...new Set([...offered, ...answered])],
    });
  },
};
