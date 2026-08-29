import { Field, Schema } from '@shadow-library/class-schema';

import { GenerationState } from './generation.schema';

@Schema()
export class ChapterSummarizeSchema {
  @Field({ minLength: 1, description: '2-3 sentence summary of what happened in the chapter, past tense' })
  summary: string;

  @Field(() => GenerationState, { description: "continuation state the next chapter needs — the same shape the standard pipeline populates at a continuing chapter's end" })
  state: GenerationState;
}

export type ChapterSummarizeOutput = ChapterSummarizeSchema;
