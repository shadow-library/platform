import { Field, Schema } from '@shadow-library/class-schema';

export const IDEA_NAME_MAX_LENGTH = 60;

@Schema()
export class IdeaNameSchema {
  @Field({
    minLength: 1,
    maxLength: IDEA_NAME_MAX_LENGTH,
    description: "2–6 words that name this idea's hook as a reader would remember it — not a genre label, no quotes, no trailing punctuation",
  })
  name: string;
}

export type IdeaNameOutput = IdeaNameSchema;
