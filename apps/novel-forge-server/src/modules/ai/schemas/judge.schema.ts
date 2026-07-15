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

@Schema()
export class EndingComplianceSchema {
  @Field({ description: 'true when the draft ending satisfies every field of the brief ending contract' })
  compliant: boolean;

  @Field(() => [String], { description: 'each contract violation, citing the field it breaks (hookType, emotionalBeat, openQuestion, handoffState, mustNotResolve)' })
  issues: string[];
}

@Schema()
export class KnowledgeComplianceSchema {
  @Field({ description: 'true when the draft neither states a forbidden fact nor lets a character act on information they could only have if they knew it' })
  compliant: boolean;

  @Field(() => [String], { description: 'each leak, citing the forbidden fact key and where the draft exposes it' })
  issues: string[];
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

  @Field(() => EndingComplianceSchema, { optional: true, description: 'assessment of the draft ending against the brief ending contract; omit when the task provided no contract' })
  endingCompliance?: EndingComplianceSchema;

  @Field(() => KnowledgeComplianceSchema, { optional: true, description: 'assessment of the draft against the forbidden-knowledge list; omit when the task provided no list' })
  knowledgeCompliance?: KnowledgeComplianceSchema;
}

export type JudgeOutput = JudgeSchema;
