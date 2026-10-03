import { EnumType, Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { JobStatus } from '@server/common';
import { type BibleAuditGroup, type BibleAuditPass, type Job, type Refinement, schema } from '@server/database';

import { RefineProjectParams } from '../refinement/refine.dto';

export const BibleAuditGroupType = EnumType.create<BibleAuditGroup>('BibleAuditGroup', ['add', 'revise', 'remove', 'contradiction']);
export const FindingDecisionType = EnumType.create('AuditFindingDecision', schema.validationFindingDecision.enumValues);
export const AuditPassStatus = EnumType.create<'ran' | 'failed'>('AuditPassStatus', ['ran', 'failed']);
export const AuditProposalStatus = EnumType.create('AuditProposalStatus', schema.refinementProposalStatus.enumValues);

@Schema()
export class AuditReportParams extends RefineProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  reportId: bigint;
}

@Schema()
export class AuditFindingParams extends AuditReportParams {
  @Field({ minLength: 1, maxLength: 20 })
  findingId: string;
}

@Schema()
export class AuditFindingDecisionBody {
  @Field(() => FindingDecisionType, {
    description: 'kept: the finding’s changes stay on the audit’s card (restaged if the card was discarded). skipped: they come off it; skipping every finding discards the card.',
  })
  decision: Job.FindingDecisionKind;

  @Field({ optional: true, maxLength: 2000, description: 'Why, remembered with the decision. Optional.' })
  reason?: string;
}

@Schema()
export class AuditEvidenceResponse {
  @Field({ description: '"doc:<section>/<slug>", "entity:<key>", "fact:<key>" or "chapter:<n>" — always something the audit read.' })
  ref: string;

  @Field({ optional: true, nullable: true, description: 'Words quoted from that source, verified to appear there; null when the finding points at the source as a whole.' })
  quote?: string | null;
}

@Schema()
export class AuditFindingDecisionResponse {
  @Field(() => FindingDecisionType)
  decision: Job.FindingDecisionKind;

  @Field({ optional: true, nullable: true })
  reason?: string | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class BibleAuditFindingResponse {
  @Field({ description: 'Stable within its report; decisions address the finding by it.' })
  id: string;

  @Field(() => BibleAuditGroupType)
  group: BibleAuditGroup;

  @Field({ description: 'The page or record the finding is about.' })
  ref: string;

  @Field()
  text: string;

  @Field(() => [AuditEvidenceResponse])
  evidence: AuditEvidenceResponse[];

  @Field(() => [Integer], { description: 'The ops of the audit’s card that carry this finding’s changes; empty when it has none.' })
  opIndexes: number[];

  @Field({ optional: true, nullable: true, description: 'Why a change the audit proposed for this finding was not put on the card.' })
  withheld?: string | null;

  @Field(() => AuditFindingDecisionResponse, { optional: true, nullable: true, description: 'The author’s Keep or Skip, if any.' })
  decision?: AuditFindingDecisionResponse | null;
}

@Schema({ description: 'The checks this report ran; a whole-bible audit runs coverage and contradictions, a chapter’s canon refresh only chapter.' })
export class AuditPassesResponse {
  @Field(() => AuditPassStatus, { optional: true, description: 'Missing and thin pages and records against the Story Bible manifest.' })
  coverage?: 'ran' | 'failed';

  @Field(() => AuditPassStatus, { optional: true, description: 'Pages, records, facts and finalized chapter summaries compared against each other.' })
  contradictions?: 'ran' | 'failed';

  @Field(() => AuditPassStatus, { optional: true, description: 'Pages and records compared against what one newly finalized chapter established.' })
  chapter?: 'ran' | 'failed';
}

@Schema()
export class AuditCheckedDocumentsResponse {
  @Field(() => Integer)
  count: number;

  @Field(() => [String])
  sections: string[];

  @Field(() => Integer, { description: 'Pages too long to read whole; only their beginning was compared.' })
  clipped: number;

  @Field(() => Integer, { description: 'Pages that did not fit and were not compared.' })
  omitted: number;
}

@Schema()
export class AuditCheckedEntitiesResponse {
  @Field(() => Integer)
  count: number;

  @Field(() => Object, { additionalProperties: true, description: 'Entity type → how many were read.' })
  byType: Record<string, number>;

  @Field(() => Integer)
  omitted: number;
}

@Schema()
export class AuditCheckedFactsResponse {
  @Field(() => Integer, { description: 'Zero when the contradiction check did not run: only it reads the facts.' })
  count: number;

  @Field(() => Integer)
  omitted: number;
}

@Schema()
export class AuditCheckedChaptersResponse {
  @Field(() => Integer)
  from: number;

  @Field(() => Integer)
  to: number;

  @Field(() => Integer)
  count: number;
}

@Schema({ description: 'Exactly what this audit read — the report never claims more.' })
export class AuditCheckedResponse {
  @Field(() => AuditPassesResponse)
  passes: Partial<Record<BibleAuditPass, 'ran' | 'failed'>>;

  @Field(() => AuditCheckedDocumentsResponse)
  documents: AuditCheckedDocumentsResponse;

  @Field(() => AuditCheckedEntitiesResponse)
  entities: AuditCheckedEntitiesResponse;

  @Field(() => AuditCheckedFactsResponse)
  facts: AuditCheckedFactsResponse;

  @Field(() => AuditCheckedChaptersResponse, { optional: true, nullable: true, description: 'The finalized chapters whose summaries were compared; null when none were.' })
  chapters?: AuditCheckedChaptersResponse | null;

  @Field(() => [Integer], { description: 'Finalized chapters with no summary yet, so not compared.' })
  chaptersWithoutSummary: number[];

  @Field(() => [Integer], { description: 'Finalized isolated chapters, which the audit never reads, not even their summaries.' })
  chaptersIsolated: number[];

  @Field(() => Integer)
  chaptersOmitted: number;

  @Field({ description: 'The sentence to show, e.g. "Checked: 14 pages, 38 characters, 21 facts, chapters 1–12."' })
  copy: string;
}

@Schema({ description: 'One Story Bible audit: its findings, what it checked, and the card that carries its proposed changes.' })
export class BibleAuditReportResponse {
  @Field(() => String)
  id: bigint;

  @Field({ description: 'What was found and what was checked, in one line; "Nothing found. Checked: …" for a clean audit.' })
  summary: string;

  @Field(() => Integer, {
    optional: true,
    nullable: true,
    description: 'The finalized chapter this report checked the Story Bible against, queued after that chapter was finalized; null for a whole-bible audit.',
  })
  chapter?: number | null;

  @Field(() => AuditCheckedResponse)
  checked: AuditCheckedResponse;

  @Field(() => [BibleAuditFindingResponse], { description: 'Contradictions first, then pages and records to add, revise and remove.' })
  findings: BibleAuditFindingResponse[];

  @Field(() => Integer, { description: 'Findings the author has neither kept nor skipped.' })
  openFindings: number;

  @Field(() => String, { optional: true, nullable: true, description: 'The pending proposal that carries the changes; null when the audit proposed none.' })
  proposalId?: bigint | null;

  @Field(() => AuditProposalStatus, { optional: true, nullable: true })
  proposalStatus?: Refinement.ProposalStatus | null;

  @Field(() => [Integer], { description: 'The card’s op indexes to apply: every op a finding not skipped still proposes. Pass as opIndexes when applying the card.' })
  selection: number[];

  @Field({ optional: true, nullable: true })
  runId?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListBibleAuditsResponse {
  @Field(() => [BibleAuditReportResponse], { description: 'Newest first, up to the most recent 50.' })
  items: BibleAuditReportResponse[];
}

@Schema({ description: 'An audit queued as a job; its report appears in the list when the job is done.' })
export class BibleAuditJobResponse {
  @Field()
  jobId: string;

  @Field()
  runId: string;

  @Field(() => JobStatus)
  status: Job.Status;
}
