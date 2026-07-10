/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { BibleSection } from '@server/common';
import { type Bible } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class BibleDocProjectParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class BibleDocParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => BibleSection)
  section: Bible.Section;

  @Field()
  slug: string;
}

@Schema()
export class UpsertBibleDocBody {
  // Author-authored YAML frontmatter: an open key/value map with no fixed schema (keys vary per
  // document and section), so it stays an object with `additionalProperties` to keep every key.
  @Field(() => Object, { optional: true, additionalProperties: true })
  frontmatter?: Record<string, unknown>;

  @Field({ optional: true })
  body?: string;
}

@Schema()
export class BibleDocListItem {
  @Field(() => BibleSection)
  section: Bible.Section;

  @Field()
  slug: string;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}

@Schema()
export class ListBibleDocResponse {
  @Field(() => [BibleDocListItem])
  docs: BibleDocListItem[];
}

@Schema()
export class BibleDocResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => BibleSection)
  section: Bible.Section;

  @Field()
  slug: string;

  // Open YAML frontmatter (see UpsertBibleDocBody). `additionalProperties` is required here — without
  // it the response serialiser strips every nested key and returns `{}`.
  @Field(() => Object, { optional: true, nullable: true, additionalProperties: true })
  frontmatter?: Record<string, unknown> | null;

  @Field({ optional: true, nullable: true })
  body?: string | null;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;

  @Field(() => String, { format: 'date-time' })
  updatedAt: Date;
}
