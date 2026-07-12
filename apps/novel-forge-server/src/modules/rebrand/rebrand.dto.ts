/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { RebrandConversionStatus, RebrandGlossaryCategory, RebrandStatus } from '@server/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class RebrandParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class RebrandChapterParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer, { minimum: 1 })
  chapter: number;
}

@Schema()
export class RebrandSettingsBody {
  @Field(() => [String], { optional: true })
  bannedExtra?: string[];

  @Field({ optional: true })
  auditEnabled?: boolean;
}

@Schema()
export class RebrandConfigBody {
  @Field({ optional: true, nullable: true })
  directives?: string | null;

  @Field(() => RebrandSettingsBody, { optional: true })
  settings?: RebrandSettingsBody;
}

@Schema()
export class RebrandStartBody {
  @Field({ optional: true })
  force?: boolean;

  @Field(() => Integer, { optional: true, minimum: 1 })
  limit?: number;
}

@Schema()
export class GlossaryListQuery {
  @Field(() => RebrandGlossaryCategory, { optional: true })
  category?: 'character' | 'place' | 'country' | 'culture' | 'faction' | 'technique' | 'item' | 'term';

  @Field(() => Integer, { optional: true, minimum: 1 })
  page?: number;

  @Field(() => Integer, { optional: true, minimum: 1 })
  limit?: number;
}

@Schema()
export class RebrandResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => RebrandStatus)
  status: string;

  @Field({ optional: true, nullable: true })
  directives?: string | null;

  @Field({ optional: true, nullable: true })
  worldNotes?: string | null;

  // Settings mirror RebrandSettingsBody but ride out as an open jsonb blob (nullable class refs
  // don't serialise; same treatment as jobs.payload).
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  settings?: RebrandSettingsBody | null;

  @Field({ optional: true, nullable: true })
  lastError?: string | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ConversionCountsResponse {
  @Field(() => Integer)
  converted: number;

  @Field(() => Integer)
  attention: number;

  @Field(() => Integer)
  failed: number;
}

@Schema()
export class RebrandStatusResponse {
  @Field(() => RebrandResponse)
  rebrand: RebrandResponse;

  @Field(() => Integer)
  sourceChapters: number;

  @Field()
  scrapeComplete: boolean;

  @Field(() => Integer)
  glossaryCount: number;

  @Field(() => ConversionCountsResponse)
  counts: ConversionCountsResponse;

  // The latest rebrand job, if any — shape mirrors JobResponse but stays open for the progress blob.
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  job?: unknown;
}

@Schema()
export class GlossaryEntryResponse {
  @Field()
  sourceName: string;

  @Field(() => [String], { optional: true, nullable: true })
  variants?: string[] | null;

  @Field()
  replacement: string;

  @Field(() => RebrandGlossaryCategory)
  category: string;

  @Field({ optional: true, nullable: true })
  notes?: string | null;

  @Field(() => Integer, { optional: true, nullable: true })
  createdChapter?: number | null;
}

@Schema()
export class GlossaryListResponse {
  @Field(() => [GlossaryEntryResponse])
  items: GlossaryEntryResponse[];
}

// A model-reported audit-trail entry (fix, added scene, or issue) — an open shape whose keys vary by
// source; `additionalProperties` keeps every nested key through serialisation.
@Schema({ additionalProperties: true })
export class ConversionDetailItem {
  @Field({ optional: true })
  detail?: string;
}

@Schema()
export class ConversionResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field()
  body: string;

  @Field({ optional: true, nullable: true })
  summaryOfChanges?: string | null;

  @Field(() => [ConversionDetailItem], { optional: true, nullable: true })
  fixes?: unknown;

  @Field(() => [ConversionDetailItem], { optional: true, nullable: true })
  addedScenes?: unknown;

  @Field(() => [ConversionDetailItem], { optional: true, nullable: true })
  issues?: unknown;

  @Field(() => RebrandConversionStatus)
  status: string;

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ManuscriptResponse {
  @Field()
  markdown: string;
}
