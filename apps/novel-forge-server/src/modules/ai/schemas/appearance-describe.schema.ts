import { Field, Schema } from '@shadow-library/class-schema';

export type AppearanceConfidence = 'high' | 'medium' | 'low';

export const APPEARANCE_CONFIDENCE_LEVELS: readonly AppearanceConfidence[] = ['high', 'medium', 'low'];

@Schema()
export class AppearanceDescribeSchema {
  @Field({
    minLength: 40,
    maxLength: 1200,
    description:
      'the canonical appearance of the identified subject in a few dense sentences — build, face, hair, eyes, skin, apparent age, attire, distinctive marks; visual facts only, no background, pose, lighting or art style',
  })
  appearance: string;

  @Field(() => String, {
    enum: [...APPEARANCE_CONFIDENCE_LEVELS],
    description: 'high when the subject is unmistakable and clearly visible; medium when partly obscured or small; low when the figure had to be guessed',
  })
  confidence: AppearanceConfidence;

  @Field({
    optional: true,
    maxLength: 300,
    description: 'one line on why the identified figure is uncertain (several candidates, note matched nothing, subject obscured) — omit when there is no doubt',
  })
  ambiguity?: string;
}

export type AppearanceDescribeOutput = AppearanceDescribeSchema;
