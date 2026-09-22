import { Field, Schema } from '@shadow-library/class-schema';

export const TASTE_PAIRS_PER_ROUND = 6;
export const TASTE_PAIR_MAX = 16;
export const TASTE_SIDE_TEXT_MAX = 200;
export const TASTE_LABEL_MAX = 48;
export const TASTE_REASON_MAX = 120;
export const TASTE_REASONS_MAX = 10;

@Schema()
export class BlueprintTasteSideOut {
  @Field({
    minLength: 1,
    maxLength: TASTE_SIDE_TEXT_MAX,
    description: 'one concrete sentence about what happens on the page, so the author can picture it — never a genre word or a craft term',
  })
  text: string;

  @Field({ minLength: 1, maxLength: TASTE_LABEL_MAX, description: 'two to four words naming the taste this side stands for, as it would read in the notebook' })
  label: string;
}

@Schema()
export class BlueprintTastePairOut {
  @Field(() => BlueprintTasteSideOut)
  a: BlueprintTasteSideOut;

  @Field(() => BlueprintTasteSideOut)
  b: BlueprintTasteSideOut;
}

@Schema()
export class BlueprintTasteSchema {
  @Field(() => [BlueprintTastePairOut], {
    minItems: 1,
    maxItems: TASTE_PAIRS_PER_ROUND,
    description: 'new either/or pairs, each a real fork in this novel; never repeat a pair the author has already been asked',
  })
  pairs: BlueprintTastePairOut[];

  @Field(() => [String], {
    maxItems: TASTE_REASONS_MAX,
    description: 'reasons this author might have abandoned a book, four to ten words each and concrete enough to act on; empty once the list is already complete',
  })
  giveUpReasons: string[];

  @Field({ minLength: 1, maxLength: 400, description: 'one or two plain sentences: what the answers so far say about this author, and what the new pairs are trying to find out' })
  coachMessage: string;
}

export type BlueprintTasteOutput = BlueprintTasteSchema;
