/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { ProposalResponse } from './refinement.dto';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class RefineProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class EnhancePremiseBody {
  @Field({ optional: true, minLength: 10, maxLength: 50_000, description: 'rough overview to enhance; falls back to the project brief/premise when omitted' })
  overview?: string;
}

@Schema()
export class PremiseRationaleResponse {
  @Field()
  enhancedPremise: string;

  @Field()
  hook: string;

  @Field()
  stakes: string;

  @Field()
  protagonistDrive: string;

  @Field()
  progressionSystem: string;

  @Field()
  serializationNotes: string;

  @Field()
  genre: string;

  @Field(() => [String])
  themes: string[];
}

@Schema()
export class EnhancePremiseResponse {
  @Field(() => ProposalResponse)
  proposal: ProposalResponse;

  @Field(() => PremiseRationaleResponse)
  rationale: PremiseRationaleResponse;

  @Field()
  runId: string;
}

@Schema()
export class AuditFindingResponse {
  @Field()
  docRef: string;

  @Field()
  action: string;

  @Field()
  finding: string;
}

@Schema()
export class AuditBibleResponse {
  @Field(() => ProposalResponse, { optional: true, nullable: true })
  proposal?: ProposalResponse | null;

  @Field(() => [AuditFindingResponse])
  findings: AuditFindingResponse[];

  @Field()
  runId: string;
}
