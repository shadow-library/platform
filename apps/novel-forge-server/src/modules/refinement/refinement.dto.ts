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

@Schema()
export class ApplyProposalBody {
  // Cherry-pick selection: apply only these change-set indexes and record the rest as declined
  // (chat-hub design §5.1). Absent → apply every op.
  @Field(() => [Integer], { optional: true })
  opIndexes?: number[];
}

@Schema({ minProperties: 1 })
export class UpdateProposalBody {
  // A discriminated union of ~10 op shapes (see `change-set.ts`), each keyed by `op`. It's kept as an
  // open `ChangeOpItem` array rather than a modelled union because the ops are validated structurally
  // server-side (`validateChangeSet`) and the client renders them generically — `additionalProperties`
  // preserves each op's fields on the wire.
  @Field(() => [ChangeOpItem])
  changeSet: Record<string, unknown>[];
}

// A change-set operation on the wire: op plus whatever fields that op carries (validated server-side).
@Schema({ additionalProperties: true })
export class ChangeOpItem {
  @Field()
  op: string;
}

// One op's apply-time disposition; `result` is an open action-outcome blob (jobId/runId/proposalId).
@Schema({ additionalProperties: true })
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

  // Loose-object items keep the nested op fields intact; a bare `[Object]` makes the response
  // serialiser strip every nested key and the review UI would render empty change-sets.
  @Field(() => [ChangeOpItem])
  changeSet: Record<string, unknown>[];

  // Snapshot of the artifacts the change-set was drafted against (keyed by artifact ref) — an open map
  // whose shape follows those refs, so it keeps `additionalProperties` to preserve every key.
  @Field(() => Object, { additionalProperties: true })
  baseline: Record<string, unknown>;

  @Field()
  autoApplied: boolean;

  // Per-op dispositions recorded at apply time — applied/declined/failed (+ action results). Open
  // objects so the action `result` payloads survive serialisation.
  @Field(() => [OpResultItem], { optional: true, nullable: true })
  opResults?: Record<string, unknown>[] | null;

  @Field({ optional: true, nullable: true })
  model?: string | null;

  @Field({ optional: true, nullable: true })
  runId?: string | null;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  appliedAt?: Date | null;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  revertedAt?: Date | null;

  // Failure detail recorded when an apply fails — an open, error-source-specific blob, so it keeps
  // `additionalProperties` to preserve its nested keys.
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
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
  // The anchor: the newest applied proposal to KEEP — everything applied after it is reverted,
  // newest first (chat-hub design §5.5).
  @Field(() => String, { pattern: '^[0-9]+$' })
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
