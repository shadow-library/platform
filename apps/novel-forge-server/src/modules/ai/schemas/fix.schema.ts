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
import { FixAction } from './enums';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class FixPatch {
  @Field({ minLength: 1, description: 'exact verbatim text to find in the draft — must be unique within the chapter' })
  find: string;

  @Field({ minLength: 1, description: 'replacement text; preserves surrounding prose style' })
  replace: string;
}

// patch requires at least one patches entry; rewrite requires body — expressed as an if/then/else so
// AJV enforces the same cross-field rule zod's `.refine()` used to.
@Schema({
  if: { properties: { action: { const: 'patch' } }, required: ['action'] },
  then: { properties: { patches: { type: 'array', minItems: 1 } }, required: ['patches'] },
  else: { properties: { body: { type: 'string', minLength: 1 } }, required: ['body'] },
})
export class FixSchema {
  @Field(() => FixAction, { description: 'patch = targeted find/replace; rewrite = full chapter replacement' })
  action: 'patch' | 'rewrite';

  @Field(() => [FixPatch], { optional: true })
  patches?: FixPatch[];

  @Field({ optional: true, description: 'for rewrite only: complete replacement chapter prose' })
  body?: string;
}

export type FixOutput = FixSchema;
