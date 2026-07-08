/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

/**
 * Importing user defined packages
 */
import { ChatScope, RefinementKind, RefinementProposalStatus, SortByTime } from '@server/common';
import { type Refinement } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ProposalProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class ProposalIdParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  proposalId: bigint;
}

@Schema()
export class ListProposalsQuery extends PaginationQuery(SortByTime) {
  @Field(() => RefinementProposalStatus, { optional: true })
  status?: Refinement.ProposalStatus;

  @Field(() => RefinementKind, { optional: true })
  kind?: Refinement.Kind;

  @Field(() => ChatScope, { optional: true })
  scopeType?: Refinement.ChatScope;

  @Field({ optional: true })
  sessionId?: string;
}

@Schema({ minProperties: 1 })
export class UpdateProposalBody {
  @Field(() => [Object])
  changeSet: Record<string, unknown>[];
}

@Schema()
export class ProposalResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field({ optional: true, nullable: true })
  sessionId?: string | null;

  @Field(() => String, { optional: true, nullable: true })
  messageId?: bigint | null;

  @Field(() => ChatScope)
  scopeType: Refinement.ChatScope;

  @Field({ optional: true, nullable: true })
  scopeRef?: string | null;

  @Field(() => RefinementKind)
  kind: Refinement.Kind;

  @Field(() => RefinementProposalStatus)
  status: Refinement.ProposalStatus;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field(() => [Object])
  changeSet: Record<string, unknown>[];

  @Field(() => Object)
  baseline: Record<string, unknown>;

  @Field({ optional: true, nullable: true })
  model?: string | null;

  @Field({ optional: true, nullable: true })
  runId?: string | null;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  appliedAt?: Date | null;

  @Field(() => Object, { optional: true, nullable: true })
  error?: Record<string, unknown> | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListProposalResponse extends Paginated(ProposalResponse) {}

@Schema()
export class AppliedArtifactItem {
  @Field()
  artifactRef: string;

  @Field(() => Integer, { optional: true, nullable: true })
  newRevision?: number | null;
}

@Schema()
export class ApplyProposalResponse {
  @Field(() => ProposalResponse)
  proposal: ProposalResponse;

  @Field(() => [AppliedArtifactItem])
  applied: AppliedArtifactItem[];

  @Field(() => [String])
  staleMarked: string[];
}
