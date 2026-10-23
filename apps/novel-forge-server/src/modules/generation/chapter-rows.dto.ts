import { Field, Integer, OmitType, Schema } from '@shadow-library/class-schema';
import { Paginated, PaginationQuery } from '@shadow-library/modules/http-core';

import { BriefWriteMode, type ChapterFilter, type ChapterRow, ChapterRowFilter, ChapterRowKind, DraftReviewStatus, DraftStatus, SortByTime } from '@server/common';
import { type Generation } from '@server/database';

@Schema()
export class ListChapterRowsQuery extends OmitType(PaginationQuery(SortByTime, { limit: 25 }), ['sortBy', 'sortOrder'] as const) {
  @Field(() => ChapterRowFilter, { default: 'all' })
  filter: ChapterFilter;

  @Field({ optional: true, description: "Only rows whose brief's point of view (any pooled scene) is this entity key. Covers drafts and planned chapters too." })
  pov?: string;

  @Field({ optional: true, description: 'Only rows this thread opened, closed, or was last advanced in. Covers drafts and planned chapters too.' })
  thread?: string;
}

@Schema({ description: 'One chapter of the plan: a written draft, or a brief with no draft yet. Rows are always in chapter order.' })
class ChapterRowResponse {
  @Field(() => ChapterRowKind)
  kind: ChapterRow['kind'];

  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true, description: "The draft's title for a written row, the brief's for a planned one." })
  title?: string | null;

  @Field(() => BriefWriteMode, { optional: true, nullable: true, description: 'Null for a written chapter that has no brief.' })
  writeMode?: Generation.BriefWriteMode | null;

  @Field({ optional: true, nullable: true, description: "The chapter's point of view: the brief's own pov, or the first pooled scene pov. Null when neither names one." })
  pov?: string | null;

  @Field(() => DraftStatus, { optional: true, description: 'Written rows only.' })
  status?: Generation.DraftStatus;

  @Field(() => DraftReviewStatus, { optional: true, description: 'Written rows only.' })
  reviewStatus?: Generation.DraftReviewStatus;

  @Field(() => String, { optional: true, description: 'Written rows only.' })
  generator?: Generation.Draft['generator'];

  @Field({ optional: true, description: 'Written rows only.' })
  isolated?: boolean;

  @Field({
    optional: true,
    description: 'Written rows only: finalize is refused until the chapter has a summary — every chapter needs one — plus, for an isolated chapter, continuation state.',
  })
  finalizeBlocked?: boolean;

  @Field(() => Integer, { optional: true, description: "Written rows only: the draft's current revision." })
  revision?: number;

  @Field(() => Integer, { optional: true, nullable: true, description: 'Written rows only: the last revision the author approved, null when none was.' })
  approvedRevision?: number | null;

  @Field(() => Integer, { optional: true, description: 'Written rows only.' })
  wordCount?: number;
}

@Schema({ description: 'The first chapter the judge flagged, which blocks further generation until it is resolved.' })
class ChapterContradictionResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  judgeNote?: string | null;

  @Field(() => Integer, { description: 'How many chapters are flagged in total.' })
  count: number;
}

@Schema()
class ChapterRowCountsResponse {
  @Field(() => Integer)
  all: number;

  @Field(() => Integer)
  not_written: number;

  @Field(() => Integer)
  needs_review: number;

  @Field(() => Integer)
  draft: number;

  @Field(() => Integer)
  final: number;
}

@Schema({ description: 'One page of chapter rows, plus whole-novel figures the list needs regardless of the page shown.' })
export class ListChapterRowsResponse extends Paginated(ChapterRowResponse) {
  @Field(() => ChapterRowCountsResponse, { description: 'Rows matching each filter across the whole novel.' })
  counts: ChapterRowCountsResponse;

  @Field(() => Integer)
  totalWords: number;

  @Field(() => Integer, { optional: true, nullable: true, description: 'The lowest brief with no draft — the chapter `generate` targets next.' })
  nextBriefChapter?: number | null;

  @Field(() => Integer, {
    description:
      'The only chapter a new draft may start at — the lowest with neither a draft nor finalized prose, planned or not. Writing or filling any other unwritten chapter is refused.',
  })
  nextWritableChapter: number;

  @Field(() => Integer, { description: 'The highest planned or written chapter number, 0 when there are none.' })
  lastChapter: number;

  @Field(() => Integer, { description: 'The highest finalized chapter, 0 when none is; no chapter can be inserted below it.' })
  frontier: number;

  @Field(() => [Integer], { description: 'Every planned or written chapter number, ascending.' })
  chapters: number[];

  @Field(() => ChapterContradictionResponse, { optional: true, nullable: true })
  contradiction?: ChapterContradictionResponse | null;
}
