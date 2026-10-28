import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { ErrorResponseDto, Transform } from '@shadow-library/fastify';
import { type ContentRating, type DarkContentLevel, type SexualContentLevel, type ViolenceLevel } from '@shadow-library/sdk';

import {
  BriefWriteMode,
  ContentMode,
  ContinuityProposalStatus,
  DarkContentRating,
  DraftReviewStatus,
  DraftRevisionSource,
  DraftStatus,
  JobKind,
  JobStatus,
  RevealRuleDetails,
  SexualContentRating,
  UserFeedbackDisposition,
  ViolenceRating,
  WorkflowRunStatus,
} from '@server/common';
import { type Ai, type Generation, type Job, type Project } from '@server/database';

import { type ContinuityOutput, EndingContractSchema, KnowledgeContractSchema } from '../ai/schemas';
import { JobUsageResponse } from '../jobs/jobs.dto';

const RATING_DESCRIPTION = 'Content rating level; an omitted dimension is unrated — never send "none" to say it.';

@Schema()
export class ProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class ChapterParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer)
  n: number;
}

@Schema()
export class RevisionParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer)
  n: number;

  @Field(() => Integer)
  r: number;
}

@Schema()
export class JobParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  jobId: string;
}

@Schema()
export class SeedFromBriefBody {
  @Field()
  brief: string;

  @Field({ optional: true })
  force?: boolean;
}

@Schema({ description: 'One scene of a chapter plan.' })
class BriefSceneSchema {
  @Field({ minLength: 1 })
  summary: string;

  @Field({ optional: true, nullable: true, description: 'Entity key of the scene’s point-of-view character.' })
  pov?: string | null;

  @Field({ optional: true, description: 'What the point-of-view character wants in the scene.' })
  goal?: string;

  @Field({ optional: true, description: 'Who or what stands in the way.' })
  obstacle?: string;

  @Field({ optional: true, description: 'How things stand differently when the scene ends.' })
  turn?: string;

  @Field(() => [String], { optional: true, description: 'The on-page beats of the scene, in order.' })
  beats?: string[];

  @Field(() => Integer, { optional: true, minimum: 1, description: 'The share of the chapter length the scene fills, in words.' })
  estimatedWords?: number;
}

@Schema()
export class UpdateBriefBody {
  @Field({ optional: true })
  title?: string;

  @Field()
  body: string;

  @Field({ optional: true, description: 'Why this chapter exists in the arc. Omit to leave unchanged.' })
  chapterPurpose?: string;

  @Field({ optional: true, description: 'Entity key of the point-of-view character. Omit to leave unchanged.' })
  pov?: string;

  @Field({ optional: true, description: 'Author guidance for the writer. Omit to leave unchanged.' })
  guidance?: string;

  @Field(() => EndingContractSchema, { optional: true, nullable: true, description: 'Replacement ending contract; null removes it. Omit to leave unchanged.' })
  endingContract?: EndingContractSchema | null;

  @Field(() => KnowledgeContractSchema, { optional: true, description: 'Replacement knowledge contract. Omit to leave the existing contract unchanged.' })
  knowledgeContract?: KnowledgeContractSchema;

  @Field({ optional: true, nullable: true, description: 'The agreed direction for the chapter. Omit to leave unchanged; null or blank clears it.' })
  direction?: string | null;

  @Field(() => ContentMode, {
    optional: true,
    nullable: true,
    description:
      "How the chapter is written. Omit to leave unchanged; null follows the project's content mode. Raising it to unrestricted is refused (`AI_024`) while `GET /ai/models` reports `unrestrictedAvailable: false`.",
  })
  contentMode?: Project.ContentMode | null;

  @Field(() => [BriefSceneSchema], { optional: true, nullable: true, description: 'Replacement scene list. Omit to leave unchanged; null clears it.' })
  scenes?: BriefSceneSchema[] | null;

  @Field(() => [String], { optional: true, nullable: true, description: 'Milestone keys this chapter reaches. Omit to leave unchanged; null clears them.' })
  claimedMilestones?: string[] | null;

  @Field({ optional: true, description: 'Marks the chapter planned as the ending. Omit to leave unchanged.' })
  isEnding?: boolean;
}

@Schema()
export class GenerateBody {
  @Field(() => Integer, { optional: true })
  limit?: number;

  @Field({ optional: true })
  autoFix?: boolean;

  @Field(() => Integer, { optional: true })
  maxFixes?: number;

  @Field({ optional: true })
  guidance?: string;
}

@Schema()
export class DraftSaveBase {
  @Field(() => String, {
    optional: true,
    pattern: '^[0-9]+$',
    description: 'The id of the draft this save was made against. The three base fields go together; omit all three only to start a chapter that has no draft.',
  })
  @Transform('bigint:parse')
  baseDraftId?: bigint;

  @Field(() => Integer, { optional: true, description: 'The draft revision this save was made against.' })
  baseRevision?: number;

  @Field(() => Integer, {
    optional: true,
    description:
      'The draft `saveSeq` this save was made against. A save whose base no longer matches is refused with DRF_013 carrying the current draft; a matching autosave may fold into the revision it continues.',
  })
  baseSaveSeq?: number;
}

@Schema()
export class UpdateDraftBody extends DraftSaveBase {
  @Field({ optional: true })
  title?: string;

  @Field()
  body: string;

  @Field({ optional: true })
  summary?: string;

  @Field(() => Object, { optional: true, additionalProperties: true, description: 'Opaque workflow-specific draft state produced by the generation graph.' })
  state?: Record<string, unknown>;
}

@Schema()
export class ReviseDraftBody {
  @Field()
  note: string;
}

@Schema()
export class FeedbackBody {
  @Field()
  note: string;

  @Field(() => UserFeedbackDisposition, { optional: true })
  disposition?: Ai.UserFeedbackDisposition;
}

@Schema()
export class ApproveDraftBody {
  @Field(() => Integer, { description: 'The draft revision the author read. The approval is refused with DRF_013 when the draft has moved past it.' })
  revision: number;

  @Field({ optional: true })
  reviewerId?: string;

  @Field({ optional: true })
  idempotencyKey?: string;

  @Field({
    optional: true,
    description:
      'Approve a stale draft as written: its prose stays, its stale reason is cleared and the override is recorded. Needs `staleReason`; refused (DRF_017) when a reveal in its plan no longer holds.',
  })
  keepStale?: boolean;

  @Field({ optional: true, description: 'With `keepStale`, the stale reason the author saw. A draft that has gone stale for another reason since is refused with DRF_013.' })
  staleReason?: string;

  @Field(() => Integer, { description: "The draft `saveSeq` the author read; refused with DRF_013 when a save changed the revision's text since." })
  saveSeq: number;

  @Field(() => String, { pattern: '^[0-9]+$', description: 'The id of the draft the author read; refused with DRF_013 when the chapter was deleted and started again since.' })
  @Transform('bigint:parse')
  draftId: bigint;
}

@Schema()
export class ContentRatingInput {
  @Field(() => SexualContentRating, { optional: true, description: RATING_DESCRIPTION })
  sexualContent?: SexualContentLevel;

  @Field(() => ViolenceRating, { optional: true, description: RATING_DESCRIPTION })
  violence?: ViolenceLevel;

  @Field(() => DarkContentRating, { optional: true, description: RATING_DESCRIPTION })
  darkContent?: DarkContentLevel;
}

@Schema()
export class ImportDraftBody extends DraftSaveBase {
  @Field()
  prose: string;

  @Field({ optional: true })
  title?: string;

  @Field({ optional: true })
  summary?: string;

  @Field(() => ContentRatingInput, { optional: true, description: 'Rating of the pasted prose; omission keeps the stored rating, an empty object clears it back to unrated.' })
  contentRating?: ContentRatingInput;

  @Field(() => Object, { additionalProperties: true, optional: true, description: 'Continuation state the next chapter builds on; omission keeps the stored state.' })
  state?: Record<string, unknown>;

  @Field({
    optional: true,
    description:
      'Firewalls this prose from the vector index, continuity extraction, and the verbatim-prose adjacency rule. Omission keeps the stored value — send false to lift an existing firewall.',
  })
  isolated?: boolean;
}

@Schema()
export class FinalizeBody {
  @Field(() => Integer, { optional: true })
  chapter?: number;
}

@Schema()
export class GenerateUnrestrictedBody {
  @Field({ optional: true })
  guidance?: string;

  @Field(() => ContentRatingInput, { optional: true, description: 'Rating of the generated prose; omission keeps the stored rating, an empty object clears it back to unrated.' })
  contentRating?: ContentRatingInput;
}

@Schema()
export class ChapterSummarizeResponse {
  @Field({
    minLength: 1,
    description:
      '2-3 sentence summary of what happened in the chapter, past tense. Saved (to the draft, and to the chapter once final) for a non-isolated or a final chapter; returned unsaved for an unfinished isolated one, for review alongside `state` before either is saved through PUT /drafts/:n. Standard calls read an isolated chapter only through its approved bridge, never this summary.',
  })
  summary: string;

  @Field(() => Integer, { optional: true, description: 'The saved draft’s new `saveSeq`, present only when this call persisted the summary — a non-isolated or a final chapter.' })
  saveSeq?: number;

  @Field(() => Object, {
    additionalProperties: true,
    description: "Continuation state the next chapter would build on. Isolated chapters only — always returned unsaved, for the author's review.",
  })
  state: Record<string, unknown>;
}

@Schema()
export class UpdateSummaryBody extends DraftSaveBase {
  @Field({ minLength: 1, description: "The author's own summary for the chapter, replacing the AI-produced or previous one. Works on a final chapter too." })
  summary: string;
}

@Schema()
export class UpdateContinuityBody {
  @Field(() => Object, { additionalProperties: true, description: 'Continuity findings and suggested edits produced by the continuity model.' })
  proposal: Record<string, unknown>;
}

@Schema()
export class SearchQuery {
  @Field()
  q: string;

  @Field({ optional: true })
  index?: 'prose' | 'lore' | 'both';

  @Field(() => Integer, { optional: true })
  k?: number;
}

@Schema()
export class WorkflowRunResponse {
  @Field()
  runId: string;

  @Field()
  outcome: string;

  @Field()
  status: string;

  @Field(() => [String], { optional: true, description: 'Bible-builder only: stages a non-force run left untouched because their document already had content.' })
  skippedStages?: string[];
}

@Schema()
export class CancelRunResponse {
  @Field()
  runId: string;

  @Field(() => WorkflowRunStatus, {
    description: 'The run status as recorded right now — a `stopping` outcome still reads `running` because the run itself writes `cancelled` as it unwinds.',
  })
  status: Ai.WorkflowRunStatus;

  @Field(() => String, {
    enum: ['stopping', 'already_settled', 'not_delivered'],
    description:
      "'stopping': the cancel is recorded and the replica running the run — whichever it is — aborts it within about a second. 'already_settled': the run had already reached a terminal status, so nothing was done. 'not_delivered': the cancel is recorded, but the replica that was running the run has stopped responding, so nothing may be left to act on it; the run may have crashed.",
  })
  outcome: 'stopping' | 'already_settled' | 'not_delivered';
}

@Schema()
export class CancelJobResponse {
  @Field()
  jobId: string;

  @Field(() => JobStatus, {
    description: 'The job status as recorded right now — a `stopping` outcome still reads `in_progress` because the worker writes `cancelled` as it settles.',
  })
  status: Job.Status;

  @Field(() => String, {
    enum: ['cancelled', 'stopping', 'already_settled'],
    description:
      "'cancelled': the job was still pending and was cancelled immediately, never dispatched. 'stopping': the job was in progress; cancellation was requested and the worker will settle it as cancelled at its next step boundary. 'already_settled': the job had already reached a terminal status (done, failed, or cancelled), so nothing was done.",
  })
  outcome: 'cancelled' | 'stopping' | 'already_settled';
}

@Schema()
export class DraftResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => DraftStatus)
  status: Generation.DraftStatus;

  @Field(() => Integer)
  revision: number;

  @Field(() => Integer, { description: 'Moves on every hand save, including one folded into the current revision; send it back as `baseSaveSeq`.' })
  saveSeq: number;

  @Field(() => Integer, {
    nullable: true,
    description: 'The last revision the author approved. It survives later edits and finalize; a different `revision` means the text changed since that approval.',
  })
  approvedRevision: number | null;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field({ optional: true, nullable: true })
  body: string;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  state?: Record<string, unknown> | null;

  @Field({ optional: true, nullable: true })
  volumeKey?: string | null;

  @Field(() => DraftReviewStatus)
  reviewStatus: Generation.DraftReviewStatus;

  @Field({ optional: true, nullable: true })
  staleReason?: string | null;

  @Field(() => String)
  generator: Generation.Draft['generator'];

  @Field({
    description:
      "Firewalls this chapter's prose from the vector index, continuity extraction, and the verbatim-prose adjacency rule. Independent of `generator` — a pasted chapter can be `generator: 'human'` and still isolated.",
  })
  isolated: boolean;

  @Field(() => ContentRatingInput, { optional: true, nullable: true, description: 'Content rating of this draft\'s prose; null means unrated — never "none".' })
  contentRating?: ContentRating | null;

  @Field(() => String, { optional: true, nullable: true })
  judge?: Generation.JudgeVerdict | null;

  @Field({ optional: true, nullable: true })
  judgeNote?: string | null;

  @Field(() => Integer, {
    optional: true,
    description: 'Set by an approval: how many blocking review findings still open on the approved text the approval recorded as overridden ("approved by the author").',
  })
  overriddenFindings?: number;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema({ description: 'The draft as it stands when a save was refused for being made against an older one.' })
class ConflictingDraftResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => Integer)
  revision: number;

  @Field(() => Integer)
  saveSeq: number;

  @Field({ nullable: true })
  title: string | null;

  @Field()
  body: string;

  @Field({ nullable: true })
  summary: string | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class DraftConflictResponse extends ErrorResponseDto {
  @Field(() => ConflictingDraftResponse, { optional: true, description: 'Present on DRF_013 when the chapter still has a draft: what it holds now.' })
  current?: ConflictingDraftResponse;

  @Field(() => RevealRuleDetails, {
    optional: true,
    description: 'Present on PLN_004, when an approval or finalize would ledger a plan that reveals a locked secret: each such secret and what it still needs.',
  })
  details?: RevealRuleDetails;
}

@Schema()
export class SummaryConflictResponse extends DraftConflictResponse {
  @Field({ minLength: 1, description: 'The summary computed from the prose as it stood before the conflict — re-offer it once reloaded, rather than summarising again.' })
  attemptedSummary: string;
}

@Schema()
class FinalizeBlockerResponse {
  @Field({ description: 'The error code finalize would refuse with.' })
  code: string;

  @Field()
  message: string;
}

@Schema({ description: 'What finalize would answer for this chapter now: ready, or every reason it would refuse, in the order it checks them.' })
export class FinalizeReadinessResponse {
  @Field()
  ready: boolean;

  @Field(() => [FinalizeBlockerResponse])
  blockers: FinalizeBlockerResponse[];
}

@Schema({ description: 'A learned fact as stored: plan and proposal writes only require non-blank keys, so the response imposes no key pattern.' })
class KnowledgeRevealResponse {
  @Field()
  entityKey: string;

  @Field()
  factKey: string;
}

@Schema({ description: "A brief's knowledge contract as the pipeline reads it." })
class KnowledgeContractResponse {
  @Field(() => [String], { description: 'Entity keys whose ledgered knowledge bounds what the chapter may state.' })
  pov: string[];

  @Field(() => [KnowledgeRevealResponse], { description: 'Facts discovered on-page during this chapter; ledgered when the draft is approved.' })
  learns: KnowledgeRevealResponse[];
}

@Schema()
export class BriefResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  volumeKey?: string | null;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field()
  body: string;

  @Field(() => [String], { optional: true, nullable: true, description: 'Artifact keys for the retrieval context used to build this draft.' })
  contextRefs?: string[] | null;

  @Field({ optional: true, nullable: true, description: 'Entity key of the point-of-view character.' })
  pov?: string | null;

  @Field({ optional: true, nullable: true, description: 'Why the chapter exists — its narrative job in the arc.' })
  chapterPurpose?: string | null;

  @Field(() => [String], { optional: true, nullable: true, description: 'What concretely changes for the reader in this chapter.' })
  readerValue?: string[] | null;

  @Field(() => [String], { optional: true, nullable: true, description: 'Recent scene patterns the chapter should avoid repeating.' })
  repetitionRisks?: string[] | null;

  @Field({
    optional: true,
    nullable: true,
    description: "The outliner's warning that the chapter's planned material cannot fill the word target without padding, and the suggested remedy; cleared by a hand edit.",
  })
  densityRisk?: string | null;

  @Field(() => Object, {
    optional: true,
    nullable: true,
    additionalProperties: true,
    description: 'How the chapter must end: hookType, emotionalBeat, openQuestion, handoffState and mustNotResolve. Older briefs may carry none.',
  })
  endingContract?: unknown;

  @Field(() => KnowledgeContractResponse, {
    optional: true,
    nullable: true,
    description: 'Who bounds what the chapter may state and which facts they learn on-page; null when the chapter is unfiltered.',
  })
  knowledgeContract?: KnowledgeContractResponse | null;

  @Field({ optional: true, nullable: true, description: "The author's standing guidance for this chapter's writer." })
  guidance?: string | null;

  @Field({ optional: true, nullable: true, description: 'The agreed direction for the chapter.' })
  direction?: string | null;

  @Field(() => ContentMode, { optional: true, nullable: true, description: "How the chapter is written; null follows the project's content mode." })
  contentMode?: Project.ContentMode | null;

  @Field(() => [BriefSceneSchema], { optional: true, nullable: true })
  scenes?: BriefSceneSchema[] | null;

  @Field(() => [String], { optional: true, nullable: true, description: 'Milestone keys this chapter claims to reach.' })
  claimedMilestones?: string[] | null;

  @Field({ description: 'True for the chapter planned as the ending.' })
  isEnding: boolean;

  @Field({ optional: true, nullable: true, description: 'Set when the plan changed under this brief; generation refuses a stale brief.' })
  staleReason?: string | null;

  @Field(() => BriefWriteMode, {
    description:
      "'external' means the primary writer's batch loop skips this slot; fill it via generate-unrestricted or POST /drafts/:n/import instead of the normal generate button.",
  })
  writeMode: Generation.BriefWriteMode;

  @Field(() => String, {
    optional: true,
    nullable: true,
    format: 'date-time',
    description: 'Set when this brief was created by the insert operation rather than by an outline pass.',
  })
  insertedAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema({ description: "A brief's identity and freshness without its body." })
class BriefSummaryResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  volumeKey?: string | null;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field({ optional: true, nullable: true })
  staleReason?: string | null;

  @Field({ optional: true, nullable: true, description: 'Set when the outliner judged the planned material too thin for the word target.' })
  densityRisk?: string | null;

  @Field(() => BriefWriteMode, {
    description:
      "'external' means the primary writer's batch loop skips this slot; fill it via generate-unrestricted or POST /drafts/:n/import instead of the normal generate button.",
  })
  writeMode: Generation.BriefWriteMode;

  @Field(() => String, {
    optional: true,
    nullable: true,
    format: 'date-time',
    description: 'Set when this brief was created by the insert operation rather than by an outline pass.',
  })
  insertedAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListBriefSummaryResponse {
  @Field(() => [BriefSummaryResponse])
  items: BriefSummaryResponse[];
}

@Schema()
export class DraftRevisionResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  draftId: bigint;

  @Field(() => Integer)
  revision: number;

  @Field(() => DraftRevisionSource)
  source: Ai.DraftRevisionSource;

  @Field()
  body: string;

  @Field({ optional: true, nullable: true })
  summary?: string | null;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  state?: Record<string, unknown> | null;

  @Field({ optional: true, nullable: true })
  runId?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class UserFeedbackResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field()
  artifactType: string;

  @Field()
  artifactRef: string;

  @Field(() => UserFeedbackDisposition)
  disposition: Ai.UserFeedbackDisposition;

  @Field({ optional: true, nullable: true })
  note?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ContinuityProposalResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field()
  status: string;

  @Field(() => Object, { additionalProperties: true })
  proposal: ContinuityOutput;

  @Field({ optional: true, nullable: true })
  model?: string | null;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  appliedAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListContinuityProposalsQuery {
  @Field(() => ContinuityProposalStatus, { default: 'pending' })
  status: Generation.ContinuityProposalStatus;
}

@Schema()
export class ListContinuityProposalResponse {
  @Field(() => [ContinuityProposalResponse])
  items: ContinuityProposalResponse[];
}

@Schema()
export class JobEnqueueResponse {
  @Field()
  jobId: string;

  @Field()
  kind: string;

  @Field()
  status: string;

  @Field()
  target: string;

  @Field(() => Integer, {
    optional: true,
    description: 'Present when the batch was cut short of its limit: this chapter is an external-write slot that must be filled by hand before generation continues past it.',
  })
  stoppedAtExternalChapter?: number;

  @Field(() => Integer, {
    optional: true,
    description: 'Present when the batch was cut short of its limit: this chapter has neither a draft nor finalized prose, and generation continues only once it has one.',
  })
  stoppedAtUnwrittenChapter?: number;

  @Field(() => Integer, {
    optional: true,
    description: 'Present when the batch was cut short of its limit: this chapter teaches its characters something, and the AI writes the next only once it is approved.',
  })
  stoppedAtTeachingChapter?: number;
}

@Schema()
export class ListDraftResponse {
  @Field(() => [DraftResponse])
  items: DraftResponse[];
}

@Schema({ description: "One chapter's draft state without its prose." })
class DraftSummaryItem {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => DraftStatus)
  status: Generation.DraftStatus;

  @Field(() => DraftReviewStatus)
  reviewStatus: Generation.DraftReviewStatus;

  @Field(() => String, { optional: true, nullable: true })
  judge?: Generation.JudgeVerdict | null;

  @Field()
  isolated: boolean;

  @Field({ description: 'An ancestor chapter changed since this draft was written; approval is refused until it is regenerated.' })
  stale: boolean;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;

  @Field(() => String, {
    format: 'date-time',
    description: "When the prose was last written (generated, revised, imported or hand-edited). Unlike updatedAt, judging and stale marks don't move it.",
  })
  writtenAt: Date;
}

@Schema()
export class DraftSummaryResponse {
  @Field(() => [DraftSummaryItem])
  items: DraftSummaryItem[];
}

@Schema()
class JudgeFindingResponse {
  @Field()
  severity: string;

  @Field()
  text: string;
}

@Schema()
export class JudgeResponse {
  @Field()
  verdict: string;

  @Field(() => [JudgeFindingResponse])
  findings: JudgeFindingResponse[];
}

@Schema()
export class ListDraftRevisionResponse {
  @Field(() => [DraftRevisionResponse])
  items: DraftRevisionResponse[];
}

@Schema()
export class MarkdownResponse {
  @Field()
  markdown: string;
}

@Schema()
export class ChapterReviewResponse {
  @Field()
  disposition: string;

  @Field({ optional: true, nullable: true })
  note?: string | null;

  @Field(() => [JudgeFindingResponse], { optional: true, nullable: true })
  findings?: JudgeFindingResponse[] | null;
}

@Schema()
class SearchHitResponse {
  @Field()
  text: string;

  @Field()
  score: number;

  @Field(() => Object, { additionalProperties: true, description: 'Index-specific vector metadata, including source references and chunk information.' })
  metadata: Record<string, unknown>;
}

@Schema()
export class SearchResponse {
  @Field(() => [SearchHitResponse])
  hits: SearchHitResponse[];
}

@Schema()
class GenerationJobItem {
  @Field()
  id: string;

  @Field(() => String)
  projectId: bigint;

  @Field(() => JobKind)
  kind: string;

  @Field()
  target: string;

  @Field(() => JobStatus)
  status: string;

  @Field(() => Integer)
  attempts: number;

  @Field({ optional: true, nullable: true })
  lastError?: string | null;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Event-specific payload.' })
  payload?: unknown;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  progress?: unknown;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;

  @Field(() => JobUsageResponse)
  usage: JobUsageResponse;
}

@Schema()
export class ListGenerationJobResponse {
  @Field(() => [GenerationJobItem])
  items: GenerationJobItem[];
}
