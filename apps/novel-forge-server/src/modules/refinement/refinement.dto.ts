import { EnumType, Field, Integer, OmitType, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { ChatScope, ProposalDiagnosticKind, RefinementKind, RefinementProposalStatus, SortByTime, UndoDependentKind } from '@server/common';
import { type Refinement } from '@server/database';

import { WRITER_KEPT_KINDS, type WriterKeptKind } from './writer-preview.service';

const WriterKeptKindEnum = EnumType.create('WriterKeptKind', [...WRITER_KEPT_KINDS]);

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
export class ListProposalsQuery extends PaginationQuery(SortByTime, { sortBy: 'createdAt', sortOrder: 'desc' }) {
  @Field(() => RefinementProposalStatus, { optional: true })
  status?: Refinement.ProposalStatus;

  @Field(() => RefinementKind, { optional: true })
  kind?: Refinement.Kind;

  @Field(() => ChatScope, { optional: true })
  scopeType?: Refinement.ChatScope;

  @Field({ optional: true })
  sessionId?: string;

  @Field(() => Integer, { optional: true, minimum: 1, description: 'Only proposals with at least one operation aimed at this chapter.' })
  chapter?: number;
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
class ChangeOpItem {
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

  @Field({ optional: true, description: 'Why an op nobody rejected was declined anyway — an action that may not run from an auto-mode turn.' })
  note?: string;

  @Field(() => Object, { optional: true, additionalProperties: true })
  result?: Record<string, unknown>;
}

@Schema({ description: 'A point-of-view character a diagnostic names.' })
export class DiagnosticPovItem {
  @Field()
  entityKey: string;

  @Field()
  name: string;
}

@Schema({ description: 'A secret a diagnostic names.' })
export class DiagnosticFactItem {
  @Field()
  factKey: string;

  @Field({ description: "The secret's title: its label, or its key read as words — never its truth." })
  label: string;
}

@Schema({ description: 'What a diagnostic points at, by kind; scene indexes are zero-based.' })
export class ProposalDiagnosticData {
  @Field(() => [DiagnosticPovItem], { optional: true, description: 'pooling: the points of view that know the secrets.' })
  knowing?: DiagnosticPovItem[];

  @Field(() => [DiagnosticPovItem], { optional: true, description: 'pooling: the points of view that do not.' })
  unaware?: DiagnosticPovItem[];

  @Field(() => [DiagnosticFactItem], { optional: true, description: 'pooling: every pooled secret, where the message lists only the first few.' })
  facts?: DiagnosticFactItem[];

  @Field(() => [Integer], { optional: true, description: 'pooling: the scenes told by a knowing point of view.' })
  knowingScenes?: number[];

  @Field(() => [Integer], { optional: true, description: 'pooling: the scenes told by an unaware one, or those before the scene that learns it.' })
  unawareScenes?: number[];

  @Field(() => Integer, { optional: true, description: 'pooling: the scene whose point of view learns the secret on the page, on a learned-on-the-page finding.' })
  learnedInScene?: number;

  @Field(() => Integer, { optional: true, nullable: true, description: 'give_away and pov: the scene the finding is about.' })
  sceneIndex?: number | null;

  @Field({ optional: true, description: 'give_away: the scene field that names the term, such as summary or beats.' })
  field?: string;

  @Field(() => Integer, { optional: true, description: 'give_away: the beat, when the term is in one.' })
  beatIndex?: number;

  @Field({ optional: true, description: 'give_away: the locked secret the term gives away.' })
  factKey?: string;

  @Field({ optional: true, description: "give_away: that secret's title — never its truth." })
  label?: string;

  @Field({ optional: true, nullable: true, description: 'pov: the point of view the scene names, if any.' })
  pov?: string | null;
}

@Schema({ description: 'One advisory finding on a proposal. Its message is the matching entry of warnings.' })
export class ProposalDiagnosticItem {
  @Field(() => ProposalDiagnosticKind)
  kind: Refinement.DiagnosticKind;

  @Field()
  message: string;

  @Field(() => ProposalDiagnosticData, { optional: true })
  data?: ProposalDiagnosticData;
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

  @Field(() => [String], {
    description:
      'Advisory findings from deterministic checks on the proposal, such as a removal written as a negation; a chapter plan card also carries its pooling, point-of-view and density diagnostics, judged again on every edit. None blocks the proposal. Empty when none apply.',
  })
  warnings: string[];

  @Field(() => [ProposalDiagnosticItem], {
    description: "The warnings as typed findings, one per warning and in the same order; a chapter plan card's pooling and give-away findings carry what they point at.",
  })
  diagnostics: ProposalDiagnosticItem[];

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

@Schema({ description: "A job an applied action started — follow it on the chat's job event stream." })
export class AppliedActionJobItem {
  @Field(() => Integer, { description: 'The action op that started it.' })
  index: number;

  @Field()
  jobId: string;

  @Field({ optional: true, description: 'The workflow run it opened, when the job opens one as it is queued.' })
  runId?: string;
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

  @Field(() => [AppliedActionJobItem])
  jobs: AppliedActionJobItem[];
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

@Schema({ description: 'A record that relies on something an undo would take back.' })
export class UndoDependentItem {
  @Field(() => UndoDependentKind)
  kind: 'plan' | 'draft' | 'knowledge' | 'suggestion';

  @Field({
    description:
      'The dependent record: `chapter:<n>` for a plan, `draft:<n>` for a draft, `knowledge:<entityKey>/<factKey>` for what a character knows, `proposal:<id>` for a pending suggestion.',
  })
  ref: string;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The chapter the record belongs to, or where the character learned the fact.' })
  chapter?: number | null;

  @Field({ description: 'The undone record this one relies on, as a change-set ref.' })
  because: string;

  @Field({ description: 'Finalized history: undo never rewrites it, so the record stays as it is after the revert.' })
  final: boolean;
}

@Schema({ description: 'What undoing an applied change would affect, listed before the author confirms the revert.' })
export class UndoImpactResponse {
  @Field(() => String)
  proposalId: bigint;

  @Field(() => [UndoDependentItem])
  dependents: UndoDependentItem[];

  @Field(() => Integer, { description: 'Finalized plans and drafts that relied only on an updated record: the undo leaves them as they are, so they are counted, not listed.' })
  finalUnaffected: number;
}

@Schema()
class ChangeItemResponse {
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

/** The change feed's ordering is fixed by design — newest apply first — so it advertises no sort fields to choose between. */
@Schema()
export class ListChangesQuery extends OmitType(PaginationQuery(SortByTime, { limit: 30 }), ['sortBy', 'sortOrder'] as const) {}

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

@Schema({ description: 'A page or record the writer would read a section for.' })
export class WriterPreviewRefItem {
  @Field({ description: "The plan's context ref, such as entity:mara or bible_doc:world/lamps." })
  ref: string;

  @Field({ description: "Scrubbed as the writer's headings are; a secret is named by its title alone." })
  label: string;

  @Field({ optional: true, description: 'A locked secret the plan cites: the writer reads its cover note as a writing constraint, never its truth.' })
  constraint?: boolean;
}

@Schema({ description: 'Something the writer would be kept from. Only its name is given: never its text.' })
export class WriterKeptItem {
  @Field(() => WriterKeptKindEnum)
  kind: WriterKeptKind;

  @Field({ description: 'fact:<key> for a secret, volume:<key>, a bible_doc ref for a page, the cited ref for a refused one; ending and ending_question for those.' })
  key: string;

  @Field()
  label: string;

  @Field({
    optional: true,
    nullable: true,
    description:
      "secret: its writer note as the writer's scrub leaves it — what the writer reads among its writing constraints while the secret stays locked. Null when it has none; the writer is then told nothing of it.",
  })
  coverNote?: string | null;
}

@Schema({ description: 'A secret whose unlock condition the card changes at its chapter, against the plan stored there now.' })
export class WriterUnlockItem {
  @Field()
  factKey: string;

  @Field()
  label: string;

  @Field(() => [String], { description: 'The terms of the unlock condition, read as words.' })
  conditions: string[];

  @Field({
    description:
      'Whether the reveal rule lets this chapter reveal it once the card stands. The writer receives it only when the plan also has it learned; until then it stays among what is kept.',
  })
  revealRuleAllows: boolean;
}

@Schema({ description: 'What the chapter writer would receive if a pending plan card were applied as it stands.' })
export class WriterPreviewResponse {
  @Field(() => String)
  proposalId: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field(() => [WriterPreviewRefItem], {
    description: 'The pages and records the plan cites that resolve for the writer, point of view first — cited and resolvable, before any budget cut the pack makes.',
  })
  included: WriterPreviewRefItem[];

  @Field(() => [WriterPreviewRefItem], { description: 'Refs the plan cites that resolve to nothing.' })
  unresolved: WriterPreviewRefItem[];

  @Field(() => [WriterKeptItem])
  kept: WriterKeptItem[];

  @Field(() => [WriterUnlockItem], {
    description: 'Secrets whose unlock condition holds with the card and not with the stored plan: a claimed milestone, the ending mark or a volume move.',
  })
  unlocks: WriterUnlockItem[];

  @Field(() => [WriterUnlockItem], {
    description: 'Secrets whose unlock condition holds with the stored plan and no longer with the card: a dropped claim, an unmarked ending or a volume move.',
  })
  relocks: WriterUnlockItem[];
}
