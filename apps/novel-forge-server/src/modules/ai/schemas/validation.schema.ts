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
import { ValidationSeverity } from './enums';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ValidationIssueSchema {
  @Field(() => Integer, { optional: true, description: 'chapter number where the issue appears, omit for novel-scope issues' })
  chapter?: number;

  @Field(() => ValidationSeverity)
  severity: 'error' | 'warning';

  @Field({ minLength: 1, description: 'e.g. continuity, timeline, character_consistency, power_scaling, plot_thread' })
  category: string;

  @Field({ minLength: 1 })
  description: string;

  @Field({ optional: true, description: 'cite the specific canon fact or chapter that conflicts' })
  canonReference?: string;
}

@Schema()
export class ValidationSchema {
  @Field(() => [ValidationIssueSchema])
  issues: ValidationIssueSchema[];

  @Field({ minLength: 1, description: 'overall assessment: what is healthy and what needs attention' })
  summary: string;
}

export type ValidationOutput = ValidationSchema;
