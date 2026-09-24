import { Field, Schema } from '@shadow-library/class-schema';

export const BLUEPRINT_CONCEPT_COUNT = 4;
export const CONCEPT_TITLE_MAX = 80;
export const CONCEPT_LOGLINE_MAX = 400;
/** The three invented cards stay a pitch line; only the fromAuthor card's logline may run to the schema's full 400, to carry the whole book's direction. */
export const CONCEPT_INVENTED_LOGLINE_MAX = 280;
export const CONCEPT_ENGINE_MAX = 160;
export const CONCEPT_HOOK_MAX = 200;

@Schema()
export class BlueprintConceptCardOut {
  @Field({ minLength: 1, maxLength: CONCEPT_TITLE_MAX, description: 'a working title a reader would remember, never a description of the book' })
  title: string;

  @Field({
    minLength: 1,
    maxLength: CONCEPT_LOGLINE_MAX,
    description:
      'one sentence: who, the pressure on them, and what they stand to lose; the three invented cards stay a pitch line, but the fromAuthor card may run longer to carry the whole book’s direction',
  })
  logline: string;

  @Field({ minLength: 1, maxLength: CONCEPT_ENGINE_MAX, description: 'what keeps producing scenes once the premise is spent — no two cards may run on the same one' })
  engine: string;

  @Field({ minLength: 1, maxLength: CONCEPT_HOOK_MAX, description: 'the line that would make a browsing reader open chapter one' })
  hook: string;

  @Field({ optional: true, description: "true on the one card built from the author's own starting point, using their elements rather than yours" })
  fromAuthor?: boolean;
}

@Schema()
export class BlueprintConceptsSchema {
  @Field(() => [BlueprintConceptCardOut], {
    minItems: BLUEPRINT_CONCEPT_COUNT,
    maxItems: BLUEPRINT_CONCEPT_COUNT,
    description: 'exactly four concepts, each a novel the others are not',
  })
  cards: BlueprintConceptCardOut[];

  @Field({ minLength: 1, maxLength: 400, description: 'one or two plain sentences: what the four cards are testing, and which notebook entry shaped them' })
  coachMessage: string;
}

export type BlueprintConceptsOutput = BlueprintConceptsSchema;
