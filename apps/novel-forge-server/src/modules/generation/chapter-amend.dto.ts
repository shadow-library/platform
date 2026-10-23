import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { ContentRatingInput } from './generation.dto';

@Schema()
export class AmendChapterBody {
  @Field({
    minLength: 1,
    description: 'Replacement prose for the finalized chapter. Amend is the only path that writes past the immutability lock, and it never unlocks the chapter.',
  })
  content: string;

  @Field({ optional: true, description: 'Replacement title; omission keeps the stored title.' })
  title?: string;

  @Field({ optional: true, description: "Replacement author's note; omission keeps the stored note. The note reaches the reader, so changing it does move the published payload." })
  note?: string;

  @Field(() => ContentRatingInput, { optional: true, description: 'Rating of the amended prose; omission keeps the stored rating, an empty object clears it back to unrated.' })
  contentRating?: ContentRatingInput;
}

@Schema({ description: 'Outcome of amending finalized canon in place. The amendment is prose-only: the bible, continuity, and downstream chapters are untouched.' })
export class AmendChapterResponse {
  @Field(() => Integer)
  chapter: number;

  @Field(() => Integer, { description: 'Word count recomputed from the amended prose.' })
  wordCount: number;

  @Field({
    description:
      'False when the chapter is isolated (isolated prose is never indexed) or the re-embed failed. A failed re-embed leaves the chapter unindexed until the next backfill; the amended prose is committed either way.',
  })
  indexed: boolean;

  @Field({ description: 'True when the reader-facing payload hash moved and the publication was rescheduled for the next push sweep. An unchanged payload never republishes.' })
  republished: boolean;

  @Field(() => Integer, { optional: true, description: 'Publication revision after the bump; absent when nothing was republished.' })
  publicationRevision?: number;

  @Field({
    description:
      'Always true. Amend replaces prose only, so anything this chapter already contributed to the bible stays there and keeps propagating — offer POST /chapters/:n/extract-to-bible so the author can re-derive canon deliberately.',
  })
  suggestExtractToBible: boolean;
}
