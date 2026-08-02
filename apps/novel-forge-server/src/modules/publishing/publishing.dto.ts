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
import { ChapterPublicationStatus, PublicationGrantState, PublicationStatus, PublicationVisibility } from '@server/common';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

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
  // Set at first publish and immutable afterwards — the slug anchors reader URLs (design §3); later
  // values are ignored. Omitted on first publish, it is derived from the title.
  @Field(() => String, { optional: true, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 128 })
  novelSlug?: string;

  @Field(() => String, { optional: true, maxLength: 256 })
  title?: string;

  @Field(() => String, { optional: true, nullable: true })
  blurb?: string | null;

  @Field(() => String, { optional: true, nullable: true, maxLength: 512 })
  coverPath?: string | null;

  @Field(() => [String], { optional: true })
  genres?: string[];

  // POST /publish is the go-live action, so an omitted status always means 'live'
  @Field(() => String, { enum: ['live', 'retired'], optional: true })
  status?: 'live' | 'retired';
}

@Schema()
export class PublishChapterBody {
  // Request bodies cannot use ajv's date-time format (only response serialisation registers it), so
  // the ISO 8601 shape is enforced by pattern and parsed with `new Date` in the service.
  @Field(() => String, { optional: true, pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$' })
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

  // Reader wiki entries the ledger cannot account for — reported for the author, never deleted (design §6).
  @Field(() => [String])
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

  // Reader ordinals the ledger cannot account for — reported for the author, never deleted (design §6).
  @Field(() => [Integer])
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

/**
 * A full replacement of the access record. `organisationId` is deliberately absent: it comes from
 * the session's active organisation, never from the client, so a caller cannot share a novel into
 * an organisation they are not acting in.
 */
@Schema()
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

  /** Absent while the address names no verified account; such a grant conveys no access and is never pushed. */
  @Field(() => String, { optional: true, nullable: true })
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
  // Omitted (not null) while the project has never been published — the UI shows an empty panel.
  @Field(() => PublicationResponse, { optional: true })
  publication?: PublicationResponse;

  @Field(() => [ChapterPublicationResponse])
  chapters: ChapterPublicationResponse[];
}
