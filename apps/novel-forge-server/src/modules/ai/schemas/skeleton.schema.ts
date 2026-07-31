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
export class CharacterArcSchema {
  @Field({ minLength: 1, description: 'entityKey or name of the character' })
  character: string;

  @Field({ minLength: 1, description: 'development journey from novel start to end — what they learn, lose, or become' })
  arc: string;
}

@Schema()
export class SkeletonSchema {
  @Field(() => [CharacterArcSchema], { minItems: 1, description: 'arcs for all major characters' })
  characterArcs: CharacterArcSchema[];

  @Field({ minLength: 1, description: 'narrative of how protagonist(s) power/ability evolves across the entire novel — peaks, setbacks, final level' })
  powerCurve: string;

  @Field({ optional: true, description: 'the central theme as a single declarative sentence' })
  thematicStatement?: string;
}

export type SkeletonOutput = SkeletonSchema;
