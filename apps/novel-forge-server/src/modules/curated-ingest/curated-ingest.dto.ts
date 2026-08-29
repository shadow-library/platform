import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { type DarkContentLevel, type Genre, MAX_NOVEL_GENRES, MAX_NOVEL_TAGS, type SexualContentLevel, type Tag, type ViolenceLevel } from '@shadow-library/sdk';

import { DarkContentRating, NovelGenre, NovelTag, SexualContentRating, ViolenceRating } from '@server/common';

/** Matches `projects.source_ref`; the colon separates the scraper's own source name from its id. */
const SOURCE_REF_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$';

const SOURCE_REF_DESCRIPTION = 'Stable external identity of the novel at its source, e.g. `mvlempyr:1234`. It is the only key the ingest surface accepts.';

@Schema()
export class IngestNovelParams {
  @Field({ pattern: SOURCE_REF_PATTERN, description: SOURCE_REF_DESCRIPTION })
  sourceRef: string;
}

@Schema()
export class IngestChapterParams {
  @Field({ pattern: SOURCE_REF_PATTERN, description: SOURCE_REF_DESCRIPTION })
  sourceRef: string;

  @Field(() => Integer, {
    minimum: 1,
    description: 'The chapter’s position at the source, counting from 1. It never changes, even when the forge renumbers its own chapters around an inserted one.',
  })
  sourceOrdinal: number;
}

@Schema()
export class IngestNovelBody {
  // `projects.name` is varchar(255) and takes the same value as the title, so it is the binding limit.
  @Field({ minLength: 1, maxLength: 255 })
  title: string;

  @Field({ minLength: 1, maxLength: 20_000, description: 'The source’s blurb; lands as the project brief.' })
  synopsis: string;

  @Field({ optional: true, maxLength: 256, description: 'The novel’s author at the source, shown to readers alongside the title.' })
  originalAuthor?: string;

  @Field(() => [NovelGenre], { optional: true, uniqueItems: true, maxItems: MAX_NOVEL_GENRES, description: 'Catalog genres claimed by the source.' })
  genres?: Genre[];

  @Field(() => [NovelTag], { optional: true, uniqueItems: true, maxItems: MAX_NOVEL_TAGS, description: 'Catalog tags claimed by the source.' })
  tags?: Tag[];

  @Field(() => SexualContentRating, { optional: true })
  sexualContent?: SexualContentLevel;

  @Field(() => ViolenceRating, { optional: true })
  violence?: ViolenceLevel;

  @Field(() => DarkContentRating, { optional: true })
  darkContent?: DarkContentLevel;
}

@Schema()
export class IngestNovelResponse {
  @Field(() => String)
  projectId: bigint;

  @Field({ description: 'False when the source reference already named a project — the push carried no metadata across, because the forge owns it once landed.' })
  created: boolean;
}

@Schema()
export class IngestChapterBody {
  @Field({ minLength: 1, maxLength: 500 })
  title: string;

  @Field({ minLength: 1, description: 'The chapter prose, landed verbatim as a locked human final.' })
  content: string;

  @Field({ optional: true, description: 'Reader-facing author note; not part of the identity the idempotent re-push compares.' })
  authorNote?: string;
}

@Schema()
export class IngestCoverBody {
  @Field(() => String, { enum: ['image/png', 'image/jpeg', 'image/webp'] })
  mime: 'image/png' | 'image/jpeg' | 'image/webp';

  @Field({ description: 'Base64-encoded image bytes without a data URL prefix.' })
  image: string;
}

@Schema()
export class IngestManifestChapter {
  @Field(() => Integer)
  sourceOrdinal: number;

  @Field({
    description:
      'Digest of exactly `{ title, content, authorNote: null }` as pushed, stamped once when the chapter landed, so a scraper can re-hash its own copy and skip an unchanged chapter. ' +
      'It is deliberately not the published digest, which also covers the author note and the content rating.',
  })
  contentHash: string;
}

@Schema()
export class IngestManifestResponse {
  @Field(() => String)
  projectId: bigint;

  @Field(() => [IngestManifestChapter], { description: 'Every ingested chapter in source order; chapters the forge itself inserted carry no source ordinal and are absent.' })
  chapters: IngestManifestChapter[];
}
