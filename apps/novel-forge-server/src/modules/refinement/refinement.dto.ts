import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { ChatScope, RefinementKind, RefinementProposalStatus, SortByTime } from '@server/common';
import { type Refinement } from '@server/database';

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

@Schema()
export class ApplyProposalBody {
  @Field(() => [Integer], { optional: true, description: 'Change-set indexes to apply; omission applies every operation.' })
  opIndexes?: number[];
}

@Schema({ minProperties: 1 })
export class UpdateProposalBody {
  @Field(() => [ChangeOpItem], { description: 'Replacement change-set operations, each discriminated by its op field.' })
  changeSet: Record<string, unknown>[];
}

@Schema({ additionalProperties: true, description: 'Change-set operation whose remaining fields depend on its server-validated op value.' })
export class ChangeOpItem {
  @Field()
  op: string;
}

@Schema({ additionalProperties: true, description: 'Apply-time disposition for one operation, optionally including a job, run, or proposal result.' })
export class OpResultItem {
  @Field(() => Integer)
  index: number;

  @Field()
  status: string;

  @Field({ optional: true })
  error?: string;

  @Field(() => Object, { optional: true, additionalProperties: true })
  result?: Record<string, unknown>;
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

  // A bare Object array makes the response serialiser strip nested operation fields.
  @Field(() => [ChangeOpItem], { description: 'Proposed operations, each discriminated by its op field.' })
  changeSet: Record<string, unknown>[];

  @Field(() => Object, { additionalProperties: true, description: 'Artifact snapshots keyed by the references the change-set was drafted against.' })
  baseline: Record<string, unknown>;

  @Field()
  autoApplied: boolean;

  @Field({ description: 'Whether this proposal has been applied and carries inverse operations, allowing it to be reverted.' })
  revertible: boolean;

  @Field(() => [OpResultItem], { optional: true, nullable: true, description: 'Apply-time result for each operation.' })
  opResults?: Record<string, unknown>[] | null;

  @Field({ optional: true, nullable: true })
  model?: string | null;

  @Field({ optional: true, nullable: true })
  runId?: string | null;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  appliedAt?: Date | null;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  revertedAt?: Date | null;

  @Field(() => Object, {
    optional: true,
    nullable: true,
    additionalProperties: true,
    description: 'Error-source-specific failure details recorded when proposal application fails.',
  })
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

  @Field(() => [OpResultItem])
  opResults: OpResultItem[];
}

@Schema()
export class RevertProposalResponse {
  @Field(() => ProposalResponse)
  proposal: ProposalResponse;

  @Field(() => [AppliedArtifactItem])
  reverted: AppliedArtifactItem[];

  @Field(() => [String])
  staleMarked: string[];
}

@Schema()
export class ChangeItemResponse {
  @Field(() => String)
  id: bigint;

  @Field({ optional: true, nullable: true })
  sessionId?: string | null;

  @Field(() => RefinementKind)
  kind: Refinement.Kind;

  @Field(() => ChatScope)
  scopeType: Refinement.ChatScope;

  @Field(() => RefinementProposalStatus)
  status: Refinement.ProposalStatus;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field()
  autoApplied: boolean;

  @Field(() => [String])
  refs: string[];

  @Field()
  revertible: boolean;

  @Field(() => [OpResultItem], { optional: true, nullable: true })
  opResults?: Record<string, unknown>[] | null;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  appliedAt?: Date | null;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  revertedAt?: Date | null;
}

@Schema()
export class ListChangesQuery extends PaginationQuery(SortByTime) {}

@Schema()
export class ListChangesResponse extends Paginated(ChangeItemResponse) {}

@Schema()
export class RollbackBody {
  @Field(() => String, {
    pattern: '^[0-9]+$',
    description: 'Newest applied proposal to keep; every later proposal is reverted newest first.',
  })
  @Transform('bigint:parse')
  afterProposalId: bigint;
}

@Schema()
export class RolledBackItem {
  @Field(() => String)
  proposalId: bigint;

  @Field(() => [AppliedArtifactItem])
  artifacts: AppliedArtifactItem[];
}

@Schema()
export class RollbackResponse {
  @Field(() => [RolledBackItem])
  reverted: RolledBackItem[];

  @Field(() => [String])
  skipped: string[];

  @Field(() => String, { optional: true })
  stoppedAt?: string;

  @Field(() => Object, { optional: true, additionalProperties: true })
  conflict?: Record<string, unknown>;
}
