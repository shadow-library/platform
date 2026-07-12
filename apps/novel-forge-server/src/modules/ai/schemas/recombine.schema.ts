/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { RecombineVerdict } from './enums';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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
