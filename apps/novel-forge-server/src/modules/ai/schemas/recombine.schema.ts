import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { RecombineVerdict } from './enums';

@Schema()
export class RecombineDecision {
  @Field(() => Integer, { description: 'the chapter number the boundary sits after, exactly as given' })
  afterChapter: number;

  @Field(() => RecombineVerdict)
  verdict: 'merge' | 'split';
}

@Schema()
export class RecombineSchema {
  @Field(() => [RecombineDecision], { description: 'one decision per listed boundary' })
  decisions: RecombineDecision[];
}

export type RecombineOutput = RecombineSchema;
