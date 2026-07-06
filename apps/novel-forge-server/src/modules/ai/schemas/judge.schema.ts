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
import { JudgeVerdict } from '@server/common';
import { type Generation } from '@server/database';

import { JudgeSeverity } from './enums';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class JudgeFinding {
  @Field(() => JudgeSeverity, { description: 'hard = contradicts established canon and blocks acceptance; soft = wrinkle worth noting' })
  severity: 'hard' | 'soft';

  @Field({ description: 'one finding, citing the canon it conflicts with (chapter or tracker)' })
  text: string;
}

// A contradiction verdict must include at least one hard finding — expressed declaratively as a
// JSON Schema if/then so AJV enforces the same cross-field rule zod's `.refine()` used to.
@Schema({
  if: { properties: { verdict: { const: 'contradiction' } }, required: ['verdict'] },
  then: {
    properties: { findings: { type: 'array', contains: { type: 'object', properties: { severity: { const: 'hard' } }, required: ['severity'] } } },
    required: ['findings'],
  },
})
export class JudgeSchema {
  @Field(() => JudgeVerdict)
  verdict: Generation.JudgeVerdict;

  @Field(() => [JudgeFinding])
  findings: JudgeFinding[];
}

export type JudgeOutput = JudgeSchema;
