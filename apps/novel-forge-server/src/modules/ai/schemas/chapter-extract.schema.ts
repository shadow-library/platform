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
export class ChapterExtractSchema {
  @Field({ optional: true, description: 'one line naming the new canon this chapter establishes, or empty when it adds nothing' })
  summary?: string;

  @Field(() => [Object], {
    description:
      'change-set ops — entity.upsert / entity.remove / bible_document.upsert / bible_document.remove for canon this chapter newly establishes or changes; empty when the chapter adds nothing new',
  })
  changeSet: Record<string, unknown>[];
}

export type ChapterExtractOutput = ChapterExtractSchema;
