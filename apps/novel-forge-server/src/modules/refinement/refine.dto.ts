import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { chatScope } from '@server/database';

import { ProposalResponse } from './refinement.dto';

@Schema()
export class RefineProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class EnhancePremiseBody {
  @Field({ optional: true, minLength: 10, maxLength: 200_000, description: 'rough overview to enhance; falls back to the project brief/premise when omitted' })
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
  ref: string;

  @Field()
  action: string;

  @Field()
  finding: string;
}

@Schema()
export class AuditBibleResponse {
  @Field(() => ProposalResponse, { optional: true })
  proposal?: ProposalResponse;

  @Field(() => [AuditFindingResponse])
  findings: AuditFindingResponse[];

  @Field()
  runId: string;
}

@Schema()
export class ContextPreviewQuery {
  @Field({ enum: ['generation', 'outline', 'chat', 'premise', 'audit'] })
  purpose: string;

  @Field(() => Integer, { optional: true, minimum: 1, description: 'required for generation/outline' })
  chapter?: number;

  @Field({ optional: true, enum: chatScope.enumValues, description: 'chat scope type' })
  scopeType?: string;
}

@Schema()
export class ContextSectionPreview {
  @Field()
  key: string;

  @Field()
  tier: string;

  @Field()
  segment: string;

  @Field(() => Integer)
  tokens: number;

  @Field()
  truncated: boolean;
}

@Schema()
export class OmittedSectionPreview {
  @Field()
  key: string;

  @Field({ description: "why the section did not reach the model: 'budget' (evicted) or 'unresolved' (ref never resolved)" })
  reason: string;
}

@Schema()
export class ContextPreviewResponse {
  @Field()
  purpose: string;

  @Field(() => Integer)
  budgetTokens: number;

  @Field(() => Integer)
  usedTokens: number;

  @Field(() => [ContextSectionPreview])
  sections: ContextSectionPreview[];

  @Field(() => [String])
  unresolvedRefs: string[];

  @Field(() => [OmittedSectionPreview])
  omitted: OmittedSectionPreview[];

  @Field()
  renderedStable: string;

  @Field()
  renderedVolatile: string;

  @Field()
  rendered: string;
}
