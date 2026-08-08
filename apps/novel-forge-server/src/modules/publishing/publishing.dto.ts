import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { ChapterPublicationStatus, PublicationGrantState, PublicationStatus, PublicationVisibility } from '@server/common';

@Schema()
export class PublishingProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class PublishingChapterParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer, { minimum: 1 })
  chapter: number;
}

@Schema()
export class PublishNovelBody {
  @Field(() => String, {
    optional: true,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    maxLength: 128,
    description: 'Immutable reader URL slug set on first publish; omission derives it from the title and later values are ignored.',
  })
  novelSlug?: string;

  @Field(() => String, { optional: true, maxLength: 256 })
  title?: string;

  @Field(() => String, { optional: true, nullable: true })
  blurb?: string | null;

  @Field(() => String, { optional: true, nullable: true, maxLength: 512 })
  coverPath?: string | null;

  @Field(() => [String], { optional: true })
  genres?: string[];

  @Field(() => String, { enum: ['live', 'retired'], optional: true, description: "Publication status; omission defaults to 'live'." })
  status?: 'live' | 'retired';
}

@Schema()
export class PublishChapterBody {
  // Request validation cannot use AJV's date-time format because only response serialisation registers it.
  @Field(() => String, {
    optional: true,
    pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$',
    description: 'ISO 8601 release time; omission publishes immediately.',
  })
  scheduledAt?: string;
}

@Schema()
export class PublicationResponse {
  @Field(() => String)
  id: bigint;

  @Field()
  novelSlug: string;

  @Field()
  title: string;

  @Field({ optional: true, nullable: true })
  blurb?: string | null;

  @Field({ optional: true, nullable: true })
  coverPath?: string | null;

  @Field(() => [String], { optional: true, nullable: true })
  genres?: string[] | null;

  @Field(() => PublicationStatus)
  status: string;

  @Field(() => Integer)
  revision: number;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ChapterPublicationResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field(() => Integer)
  publishedOrdinal: number;

  @Field()
  title: string;

  @Field({ optional: true, nullable: true })
  authorNote?: string | null;

  @Field()
  contentHash: string;

  @Field(() => Integer)
  revision: number;

  @Field(() => ChapterPublicationStatus)
  status: string;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  scheduledAt?: Date | null;

  @Field(() => String, { format: 'date-time', optional: true, nullable: true })
  publishedAt?: Date | null;

  @Field({ optional: true, nullable: true })
  error?: string | null;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ReconcileFailureItem {
  @Field(() => Integer)
  ordinal: number;

  @Field()
  error: string;
}

@Schema()
export class WikiReconcileFailureItem {
  @Field()
  entryKey: string;

  @Field()
  error: string;
}

@Schema()
export class WikiReconcileResult {
  @Field(() => [String])
  pushed: string[];

  @Field(() => [String])
  deleted: string[];

  @Field(() => [String])
  skipped: string[];

  @Field(() => [WikiReconcileFailureItem])
  failed: WikiReconcileFailureItem[];

  @Field(() => [String], { description: 'Reader wiki entries absent from the ledger; reported but never automatically deleted.' })
  unknownEntries: string[];
}

@Schema()
export class ReconcileResponse {
  @Field(() => String, { enum: ['applied', 'noop'] })
  novel: 'applied' | 'noop';

  @Field(() => String, { enum: ['applied', 'noop'] })
  access: 'applied' | 'noop';

  @Field(() => [Integer])
  pushed: number[];

  @Field(() => [Integer])
  deleted: number[];

  @Field(() => [Integer])
  skipped: number[];

  @Field(() => [ReconcileFailureItem])
  failed: ReconcileFailureItem[];

  @Field(() => [Integer], { description: 'Reader chapter ordinals absent from the ledger; reported but never automatically deleted.' })
  unknownOrdinals: number[];

  @Field(() => WikiReconcileResult)
  wiki: WikiReconcileResult;
}

/** A share list is a handful of people; an author who needs more than this wants organisation visibility. */
export const MAX_GRANT_EMAILS = 200;

@Schema()
export class AccessGrantInput {
  @Field({ maxLength: 255, pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' })
  email: string;
}

// organisationId must come from the active session so callers cannot share into another organisation.
@Schema({ description: 'Full replacement for a publication access policy and its restricted-tier grants.' })
export class PublicationAccessBody {
  @Field(() => PublicationVisibility)
  visibility: string;

  @Field(() => [AccessGrantInput], { optional: true, maxItems: MAX_GRANT_EMAILS })
  grants?: AccessGrantInput[];
}

@Schema()
export class AccessGrantItem {
  @Field()
  email: string;

  @Field(() => String, {
    optional: true,
    nullable: true,
    description: 'Verified account subject; absent addresses convey no access and are not pushed to the reader.',
  })
  subjectId?: string | null;

  @Field(() => PublicationGrantState)
  state: string;
}

@Schema()
export class PublicationAccessResponse {
  @Field(() => PublicationVisibility)
  visibility: string;

  @Field(() => String, { optional: true, nullable: true })
  organisationId?: string | null;

  @Field(() => Integer)
  accessRevision: number;

  @Field(() => [AccessGrantItem])
  grants: AccessGrantItem[];
}

@Schema()
export class PublicationsLedgerResponse {
  @Field(() => PublicationResponse, { optional: true, description: 'Publication details; omitted until the project is first published.' })
  publication?: PublicationResponse;

  @Field(() => [ChapterPublicationResponse])
  chapters: ChapterPublicationResponse[];
}
