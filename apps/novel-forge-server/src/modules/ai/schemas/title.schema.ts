/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class TitleSchema {
  @Field({ minLength: 1, maxLength: 200, description: 'chapter title, evocative and consistent with established chapter title style' })
  title: string;

  @Field(() => [String], { optional: true, description: '2-3 alternatives if uncertain' })
  alternatives?: string[];
}

export type TitleOutput = TitleSchema;
