import { Field, Schema } from '@shadow-library/class-schema';

export const START_CHIP_KINDS = ['element', 'want', 'not'] as const;
export const START_CHIP_MAX = 12;
export const START_CHIP_LABEL_MAX = 80;

export type StartChipKind = (typeof START_CHIP_KINDS)[number];

@Schema()
export class BlueprintStartChipOut {
  @Field({ minLength: 1, maxLength: START_CHIP_LABEL_MAX, description: "one thing the author said, in two to eight words and in the author's own terms where possible" })
  label: string;

  @Field(() => String, {
    enum: [...START_CHIP_KINDS],
    description:
      "'element' for something that is in the story (a person, place, situation, image), 'want' for a feeling or quality the author wants a reader to get, 'not' for something the author ruled out",
  })
  kind: StartChipKind;
}

@Schema()
export class BlueprintStartSchema {
  @Field(() => [BlueprintStartChipOut], {
    maxItems: START_CHIP_MAX,
    description: 'what you understood, one chip per distinct thing the author said; empty when the author gave you nothing to read back',
  })
  understood: BlueprintStartChipOut[];

  @Field({ minLength: 1, maxLength: 400, description: 'one or two plain sentences to the author: what you took from their words, and the one thing you were least sure about' })
  coachMessage: string;
}

export type BlueprintStartOutput = BlueprintStartSchema;
