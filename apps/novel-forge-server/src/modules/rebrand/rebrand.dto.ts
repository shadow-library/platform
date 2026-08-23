import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { RebrandConversionStatus, RebrandGlossaryCategory, RebrandStatus } from '@server/common';

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

  @Field(() => [String], {
    optional: true,
    description: "Named banned-term packs to scan for (see banned-terms.ts); default ['east-asian']. Reforge reuses this project's selection.",
  })
  termPacks?: string[];

  @Field(() => Integer, { optional: true, minimum: 0, description: 'Max repair attempts before persisting as attention (default 1).' })
  maxRepairs?: number;
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

  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true, description: 'Settings used for this rebrand run.' })
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

  @Field(() => Integer)
  glossaryCount: number;

  @Field(() => ConversionCountsResponse)
  counts: ConversionCountsResponse;

  @Field(() => Object, {
    optional: true,
    nullable: true,
    additionalProperties: true,
    description: 'Latest rebrand job, including its job-specific progress fields.',
  })
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

@Schema({ additionalProperties: true, description: 'Model-reported audit entry whose fields vary by source.' })
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
export class ConversionSummaryResponse {
  @Field(() => Integer)
  chapter: number;

  @Field({ optional: true, nullable: true })
  title?: string | null;

  @Field(() => RebrandConversionStatus)
  status: string;

  @Field(() => Integer)
  issueCount: number;

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListConversionsResponse {
  @Field(() => [ConversionSummaryResponse])
  items: ConversionSummaryResponse[];
}

@Schema()
export class ManuscriptResponse {
  @Field()
  markdown: string;

  @Field(() => [Integer], { description: 'Chapters that failed conversion and are missing from the markdown below.' })
  failedChapters: number[];
}
