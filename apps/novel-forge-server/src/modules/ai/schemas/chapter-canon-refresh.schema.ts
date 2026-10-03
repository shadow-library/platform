import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class CanonRefreshEvidence {
  @Field({ minLength: 1, description: 'the source this rests on, exactly as labelled in the material: "chapter:<n>", "doc:<section>/<slug>" or "entity:<key>"' })
  ref: string;

  @Field({ minLength: 1, description: 'the words of that source, copied verbatim from the material' })
  quote: string;
}

@Schema()
export class CanonRefreshUpdate {
  @Field({ minLength: 1, description: 'what the chapter established and which page or record no longer says it, in one or two plain sentences the author can act on' })
  finding: string;

  @Field(() => [CanonRefreshEvidence], {
    minItems: 1,
    description: 'the chapter’s own words first, then the out-of-date words of the page or record when it states something else',
  })
  evidence: CanonRefreshEvidence[];

  @Field(() => [Object], { minItems: 1, description: 'the ops that bring the page or record up to date (bible_document.upsert, entity.upsert only)' })
  changeSet: Record<string, unknown>[];
}

@Schema()
export class ChapterCanonRefreshSchema {
  @Field(() => [CanonRefreshUpdate], { description: 'one entry per page or record the chapter left out of date; empty when the Story Bible already reflects it' })
  updates: CanonRefreshUpdate[];
}

export type ChapterCanonRefreshOutput = ChapterCanonRefreshSchema;
