import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import {
  ChapterTranslationStatus,
  TranslationGlossaryCategory,
  TranslationGlossaryOrigin,
  TranslationGlossaryStatus,
  TranslationPhase,
  TranslationTreatment,
} from '@server/common';
import { type Translation } from '@server/database';

@Schema()
export class TranslationParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class TranslationChapterParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer, { minimum: 1 })
  chapter: number;
}

@Schema()
export class TranslationTermParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  id: bigint;
}

@Schema()
export class FidelityBandsBody {
  @Field(() => [Number], { optional: true, minItems: 2, maxItems: 2, description: 'Accepted [min, max] ratio of translated length to original length.' })
  lengthRatio?: [number, number];

  @Field(() => [Number], { optional: true, minItems: 2, maxItems: 2, description: 'Accepted [min, max] ratio of translated paragraph count to original paragraph count.' })
  paragraphRatio?: [number, number];
}

@Schema()
export class TranslationSettingsBody {
  @Field({ optional: true, description: 'Run the per-chapter AI audit; the deterministic fidelity scan always runs. Default true.' })
  auditEnabled?: boolean;

  @Field(() => Integer, { optional: true, minimum: 0, description: 'Max repair attempts before a chapter is persisted as attention (default 1).' })
  maxRepairs?: number;

  @Field({ optional: true, description: 'Stop the job after seeding so the glossary is reviewed before later chapters bind to it (default true).' })
  pauseAfterSeed?: boolean;

  @Field(() => Integer, { optional: true, minimum: 200, description: 'Max tokens of original prose per translated segment (default 1800).' })
  segmentTokens?: number;

  @Field(() => FidelityBandsBody, { optional: true, description: 'Per-project overrides for the fidelity ratio bands; per-language defaults apply to whichever band is unset.' })
  fidelityBands?: FidelityBandsBody;

  @Field(() => String, {
    optional: true,
    enum: ['keep', 'translate'],
    description: 'Whether source honorifics survive into the English prose or become English address (default keep).',
  })
  honorifics?: 'keep' | 'translate';
}

@Schema()
export class TranslationConfigBody {
  @Field({ optional: true, nullable: true, description: 'The style guide every chapter is translated against; seeded by the job and editable by hand.' })
  styleNotes?: string | null;

  @Field(() => TranslationSettingsBody, { optional: true })
  settings?: TranslationSettingsBody;
}

@Schema()
export class TranslationStartBody {
  @Field(() => [Integer], { optional: true, description: 'Explicit chapter numbers to translate; overrides the derived selection.' })
  chapters?: number[];

  @Field({ optional: true, description: 'Re-translate chapters that already have a translation. Finalized chapters are never targets — reopen them first.' })
  force?: boolean;

  @Field(() => Integer, { optional: true, minimum: 1, description: 'Cap on the number of chapters this run translates, for trial runs.' })
  limit?: number;

  @Field({ optional: true, description: 'Select chapters whose glossary or original changed since they were translated, instead of untranslated ones.' })
  stale?: boolean;
}

@Schema()
export class TranslationResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => TranslationPhase, { description: 'Advisory display state only — the executor derives the real phase from the data on every run.' })
  phase: string;

  @Field({ optional: true, nullable: true })
  styleNotes?: string | null;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Settings used for this translation run.' })
  settings?: TranslationSettingsBody | null;

  @Field({ optional: true, nullable: true })
  lastError?: string | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class TranslationChapterCountsResponse {
  @Field(() => Integer, { description: 'Chapters carrying original-language prose.' })
  originals: number;

  @Field(() => Integer, { description: 'Originals with no translation row yet.' })
  untranslated: number;

  @Field(() => Integer)
  translated: number;

  @Field(() => Integer)
  attention: number;

  @Field(() => Integer)
  finalized: number;

  @Field(() => Integer)
  failed: number;

  @Field(() => Integer, { description: 'Translations whose glossary or original moved since they were produced.' })
  stale: number;
}

@Schema()
export class TranslationGlossaryCountsResponse {
  @Field(() => Integer)
  approved: number;

  @Field(() => Integer)
  suggested: number;

  @Field(() => Integer)
  rejected: number;
}

@Schema()
export class TranslationStatusResponse {
  @Field(() => TranslationResponse)
  translation: TranslationResponse;

  @Field({ optional: true, nullable: true, description: 'BCP-47-ish code of the prose being translated from.' })
  originalLanguage?: string | null;

  @Field(() => TranslationChapterCountsResponse)
  counts: TranslationChapterCountsResponse;

  @Field(() => TranslationGlossaryCountsResponse)
  glossary: TranslationGlossaryCountsResponse;

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Latest translate job, including its job-specific progress fields.' })
  job?: unknown;
}

@Schema()
export class OriginalChapterBody {
  @Field({ maxLength: 500, description: 'The chapter title exactly as the source writes it.' })
  title: string;

  @Field({ minLength: 1, description: 'The untranslated chapter prose. Rejected with a field error when it does not match the project language.' })
  content: string;
}

@Schema()
export class OriginalChapterResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field()
  content: string;

  @Field({ optional: true, nullable: true, description: 'Digest of the original title and prose, the same value the ingest manifest reports.' })
  contentHash?: string | null;
}

@Schema()
export class OriginalManifestEntry {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  contentHash?: string | null;

  @Field(() => ChapterTranslationStatus, { optional: true, nullable: true, description: 'Null when the chapter has no translation yet.' })
  translationStatus?: string | null;
}

@Schema()
export class OriginalsManifestResponse {
  @Field(() => String)
  projectId: bigint;

  @Field({ optional: true, nullable: true })
  originalLanguage?: string | null;

  @Field(() => [OriginalManifestEntry])
  chapters: OriginalManifestEntry[];
}

@Schema()
export class TranslationChapterListQuery {
  @Field(() => Integer, { optional: true, minimum: 1 })
  page?: number;

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 200 })
  limit?: number;

  @Field(() => ChapterTranslationStatus, { optional: true })
  status?: Translation.ChapterStatus;

  @Field({ optional: true, description: 'True lists only chapters whose glossary or original moved; false only those that did not.' })
  stale?: boolean;
}

@Schema()
export class TranslationChapterSummaryResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  originalTitle?: string | null;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => ChapterTranslationStatus, { optional: true, nullable: true, description: 'Null when the chapter has originals but no translation yet.' })
  status?: string | null;

  @Field(() => Integer)
  issueCount: number;

  @Field(() => Integer, { description: 'Glossary entries this chapter rendered that are still awaiting review; finalize is blocked while it is non-zero.' })
  pendingTerms: number;

  @Field()
  glossaryStale: boolean;

  @Field()
  sourceStale: boolean;

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  updatedAt?: Date | null;
}

@Schema()
export class TranslationChapterListResponse {
  @Field(() => [TranslationChapterSummaryResponse])
  items: TranslationChapterSummaryResponse[];

  @Field(() => Integer)
  total: number;

  @Field(() => Integer)
  page: number;

  @Field(() => Integer)
  limit: number;
}

@Schema({ additionalProperties: true, description: 'A fidelity-scan, audit or run defect recorded on the translation.' })
class TranslationIssueItem {
  @Field({ optional: true })
  type?: string;

  @Field({ optional: true })
  detail?: string;
}

@Schema()
export class AppliedTermResponse {
  @Field(() => String)
  id: bigint;

  @Field()
  sourceTerm: string;

  @Field()
  target: string;

  @Field(() => TranslationGlossaryStatus)
  status: string;

  @Field(() => Integer)
  revision: number;

  @Field(() => Integer, { description: 'The revision of the entry as it was rendered into this chapter.' })
  appliedRevision: number;

  @Field({ description: 'True when the entry moved after this chapter rendered it.' })
  stale: boolean;
}

@Schema()
export class OriginalTextResponse {
  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field({ optional: true, nullable: true })
  content?: string | null;
}

@Schema()
export class ChapterTranslationResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field()
  body: string;

  @Field(() => ChapterTranslationStatus)
  status: string;

  @Field(() => [TranslationIssueItem], { optional: true, nullable: true })
  issues?: unknown;

  @Field()
  glossaryStale: boolean;

  @Field()
  sourceStale: boolean;

  @Field(() => Integer)
  revision: number;

  @Field({ optional: true, nullable: true })
  lastError?: string | null;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  editedAt?: Date | null;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  finalizedAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class TranslationChapterDetailResponse {
  @Field(() => Integer)
  chapter: number;

  @Field(() => OriginalTextResponse)
  original: OriginalTextResponse;

  @Field(() => ChapterTranslationResponse)
  translation: ChapterTranslationResponse;

  @Field(() => [AppliedTermResponse])
  appliedTerms: AppliedTermResponse[];
}

@Schema()
export class EditTranslationBody {
  @Field({ optional: true, maxLength: 500 })
  title?: string;

  @Field({ optional: true, minLength: 1 })
  body?: string;
}

@Schema()
export class FinalizeChapterResponse {
  @Field(() => Integer)
  chapter: number;

  @Field(() => Integer)
  wordCount: number;

  @Field({ description: 'True when the reader-facing digest moved and a republish was scheduled.' })
  republished: boolean;

  @Field(() => Integer, { optional: true })
  publicationRevision?: number;
}

@Schema()
export class TranslationGlossaryQuery {
  @Field(() => TranslationGlossaryStatus, { optional: true })
  status?: Translation.GlossaryStatus;

  @Field(() => TranslationGlossaryCategory, { optional: true })
  category?: Translation.GlossaryCategory;

  @Field(() => TranslationTreatment, { optional: true })
  treatment?: Translation.Treatment;

  @Field({ optional: true, description: 'Substring match over the source term, its variants and the target.' })
  q?: string;

  @Field(() => Integer, { optional: true, minimum: 1 })
  page?: number;

  @Field(() => Integer, { optional: true, minimum: 1, maximum: 200 })
  limit?: number;
}

@Schema()
export class TranslationTermAlternativeResponse {
  @Field()
  target: string;

  @Field()
  rationale: string;
}

@Schema()
export class TranslationTermResponse {
  @Field(() => String)
  id: bigint;

  @Field()
  sourceTerm: string;

  @Field(() => [String], { optional: true, nullable: true })
  variants?: string[] | null;

  @Field()
  target: string;

  @Field(() => TranslationGlossaryCategory)
  category: string;

  @Field(() => TranslationTreatment)
  treatment: string;

  @Field({ optional: true, nullable: true })
  meaning?: string | null;

  @Field({ optional: true, nullable: true })
  contextExcerpt?: string | null;

  @Field(() => [TranslationTermAlternativeResponse], { optional: true, nullable: true })
  alternatives?: unknown;

  @Field(() => TranslationGlossaryStatus)
  status: string;

  @Field(() => TranslationGlossaryOrigin)
  origin: string;

  @Field({ optional: true, nullable: true })
  notes?: string | null;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The chapter the term was discovered in; 0 for seeded terms.' })
  createdChapter?: number | null;

  @Field(() => Integer, { description: 'Bumped by every edit; chapters that rendered an earlier revision are marked stale.' })
  revision: number;

  @Field(() => String, { optional: true, nullable: true, format: 'date-time' })
  decidedAt?: Date | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class TranslationGlossaryListResponse {
  @Field(() => [TranslationTermResponse])
  items: TranslationTermResponse[];

  @Field(() => Integer)
  total: number;

  @Field(() => Integer)
  page: number;

  @Field(() => Integer)
  limit: number;
}

@Schema()
export class CreateTranslationTermBody {
  @Field({ minLength: 1, maxLength: 300, description: 'The term exactly as the original writes it; unique per project.' })
  sourceTerm: string;

  @Field({ minLength: 1, maxLength: 300, description: 'The English rendering every chapter must use.' })
  target: string;

  @Field(() => TranslationGlossaryCategory)
  category: Translation.GlossaryCategory;

  @Field(() => TranslationTreatment)
  treatment: Translation.Treatment;

  @Field(() => [String], { optional: true, nullable: true, description: 'Other spellings the original uses for the same thing.' })
  variants?: string[] | null;

  @Field({ optional: true, nullable: true, description: 'What this is, in one phrase, so a reviewer can judge the rendering.' })
  meaning?: string | null;

  @Field({ optional: true, nullable: true })
  notes?: string | null;
}

@Schema()
export class UpdateTranslationTermBody {
  @Field({ optional: true, minLength: 1, maxLength: 300 })
  target?: string;

  @Field(() => TranslationTreatment, { optional: true })
  treatment?: Translation.Treatment;

  @Field(() => TranslationGlossaryCategory, { optional: true })
  category?: Translation.GlossaryCategory;

  @Field({ optional: true, nullable: true })
  meaning?: string | null;

  @Field(() => [String], { optional: true, nullable: true })
  variants?: string[] | null;

  @Field({ optional: true, nullable: true })
  notes?: string | null;
}

@Schema()
export class ApproveTranslationTermBody {
  @Field({ optional: true, minLength: 1, maxLength: 300, description: 'Approve with a different rendering — a modify-and-approve, which bumps the revision.' })
  target?: string;

  @Field(() => TranslationTreatment, { optional: true })
  treatment?: Translation.Treatment;
}

@Schema()
export class TranslationTermDecision {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  id: bigint;

  @Field(() => String, { enum: ['approve', 'reject'] })
  decision: 'approve' | 'reject';

  @Field({ optional: true, minLength: 1, maxLength: 300 })
  target?: string;

  @Field(() => TranslationTreatment, { optional: true })
  treatment?: Translation.Treatment;
}

@Schema()
export class TranslationTermDecisionsBody {
  @Field(() => [TranslationTermDecision], { minItems: 1 })
  decisions: TranslationTermDecision[];
}

@Schema()
export class TranslationTermDecisionsResponse {
  @Field(() => Integer)
  approved: number;

  @Field(() => Integer)
  rejected: number;
}

@Schema()
export class TranslationManuscriptResponse {
  @Field()
  markdown: string;

  @Field(() => [Integer], { description: 'Chapters with originals that are not finalized yet and are therefore missing from the markdown.' })
  pendingChapters: number[];
}
