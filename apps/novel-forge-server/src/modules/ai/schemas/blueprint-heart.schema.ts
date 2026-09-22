import { Field, Schema } from '@shadow-library/class-schema';

export const HEART_OPTION_COUNT = 3;
export const HEART_TEXT_MAX = 200;
export const HEART_WHY_MAX = 240;
export const HEART_CAUTION_MAX = 240;
export const HEART_WRITER_LINE_MAX = 240;

@Schema()
export class BlueprintThemeOut {
  @Field({ minLength: 1, maxLength: HEART_TEXT_MAX, description: 'the question under the plot, as a question or a claim the novel argues with' })
  text: string;

  @Field({ minLength: 1, maxLength: HEART_WHY_MAX, description: 'which locked decision or notebook entry this reading of the premise comes from' })
  why: string;

  @Field({ optional: true, maxLength: HEART_CAUTION_MAX, description: 'plainly what is weaker about this option, when something is; omitted when nothing is' })
  caution?: string;

  @Field({ minLength: 1, maxLength: HEART_WRITER_LINE_MAX, description: 'what choosing it would mean for whoever writes chapter one' })
  writerLine: string;
}

@Schema()
export class BlueprintEndingQuestionOut {
  @Field({ minLength: 1, maxLength: HEART_TEXT_MAX, description: 'what the reader waits the whole novel to learn, phrased as a question' })
  text: string;

  @Field({ minLength: 1, maxLength: HEART_WHY_MAX, description: 'which locked decision or notebook entry it comes from' })
  why: string;

  @Field({
    optional: true,
    maxLength: HEART_CAUTION_MAX,
    description: 'plainly what is weaker about this option, when something is — a mystery that gets solved is a volume-one hook, not a question that ends a novel',
  })
  caution?: string;

  @Field({ minLength: 1, maxLength: HEART_WRITER_LINE_MAX, description: 'what choosing it would mean for whoever writes chapter one' })
  writerLine: string;
}

@Schema()
export class BlueprintHeartSchema {
  @Field(() => [BlueprintThemeOut], { minItems: HEART_OPTION_COUNT, maxItems: HEART_OPTION_COUNT, description: 'three themes, each a different argument about the same premise' })
  themes: BlueprintThemeOut[];

  @Field(() => [BlueprintEndingQuestionOut], {
    minItems: HEART_OPTION_COUNT,
    maxItems: HEART_OPTION_COUNT,
    description: 'three ending questions; at most one of them may be a mystery that gets solved, and it must carry its caution',
  })
  endings: BlueprintEndingQuestionOut[];

  @Field({ minLength: 1, maxLength: 400, description: 'one or two plain sentences naming what separates these options, and any option you think is weaker and why' })
  coachMessage: string;
}

export type BlueprintHeartOutput = BlueprintHeartSchema;
