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
import { ReviewDisposition, ReviewSeverity } from './enums';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ReviewFinding {
  @Field(() => ReviewSeverity)
  severity: 'blocking' | 'suggestion';

  @Field({ minLength: 1, description: 'specific finding with location if possible' })
  text: string;
}

@Schema()
export class ReviewSchema {
  @Field(() => ReviewDisposition)
  disposition: 'approve' | 'revision_requested';

  @Field({ optional: true, description: 'overall note to the author' })
  note?: string;

  @Field(() => [ReviewFinding], { optional: true })
  findings?: ReviewFinding[];
}

export type ReviewOutput = ReviewSchema;
