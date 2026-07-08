/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
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

@Schema()
export class PlanArcsParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  volumeKey: string;
}

@Schema()
export class PlanArcsBody {
  @Field(() => Integer, { optional: true, minimum: 1, maximum: 20 })
  arcCount?: number;

  @Field({ optional: true, maxLength: 5000 })
  guidance?: string;
}

@Schema()
export class PlannedArcItem {
  @Field()
  arcKey: string;

  @Field()
  title: string;

  @Field()
  objective: string;

  @Field()
  escalation: string;

  @Field()
  payoff: string;

  @Field()
  hook: string;

  @Field(() => Integer)
  chapterStart: number;

  @Field(() => Integer)
  chapterEnd: number;

  @Field(() => [String])
  cast: string[];

  @Field()
  body: string;

  @Field(() => [String])
  ideas: string[];
}

@Schema()
export class PlanArcsResponse {
  @Field(() => ProposalResponse)
  proposal: ProposalResponse;

  @Field(() => [PlannedArcItem])
  arcs: PlannedArcItem[];

  @Field()
  runId: string;
}
