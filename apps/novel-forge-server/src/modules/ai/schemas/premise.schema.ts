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
export class PremiseEnhanceSchema {
  @Field({ minLength: 1, description: 'the improved premise, written as a compelling web-novel pitch' })
  enhancedPremise: string;

  @Field({ minLength: 1, description: 'the opening hook — why a reader clicks chapter 1' })
  hook: string;

  @Field({ minLength: 1, description: 'what the protagonist stands to lose, and why it matters' })
  stakes: string;

  @Field({ minLength: 1, description: 'what drives the protagonist forward chapter after chapter' })
  protagonistDrive: string;

  @Field({ minLength: 1, description: 'the progression/power system and its visible ladder' })
  progressionSystem: string;

  @Field({ minLength: 1, description: 'how the premise sustains hundreds of serialized chapters — escalation room, arc seeds, reader-promise' })
  serializationNotes: string;

  @Field({ minLength: 1, description: 'primary genre and its conventions the story leans on' })
  genre: string;

  @Field(() => [String], { minItems: 1, description: 'core themes' })
  themes: string[];

  @Field(() => [Object], { minItems: 1, description: 'change-set ops: premise.update and bible_document.upsert only' })
  changeSet: Record<string, unknown>[];
}

export type PremiseEnhanceOutput = PremiseEnhanceSchema;
