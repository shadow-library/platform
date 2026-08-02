/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { NOVEL_VISIBILITIES } from '@server/modules/publish';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class ProgressBody {
  @Field(() => Integer, { minimum: 1 })
  ordinal: number;

  /** Scroll offset within the chapter as reported by the reader client */
  @Field({ minimum: 0 })
  position: number;
}

@Schema()
export class ProgressResponse {
  @Field(() => Integer)
  ordinal: number;

  @Field()
  position: number;

  /** Furthest chapter ever reached — monotonic, unaffected by rereading an earlier chapter. */
  @Field(() => Integer)
  furthestOrdinal: number;

  @Field()
  updatedAt: string;
}

@Schema()
export class ProgressListItem extends ProgressResponse {
  @Field()
  novelSlug: string;
}

@Schema()
export class ProgressListResponse {
  @Field(() => [ProgressListItem])
  items: ProgressListItem[];
}

@Schema()
export class LibraryAddBody {
  @Field({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', maxLength: 128 })
  slug: string;
}

@Schema()
export class LibraryItem {
  @Field()
  slug: string;

  @Field()
  title: string;

  /** Absolute public URL, resolved server-side from the storage origin; absent when the novel has no cover. */
  @Field(() => String, { optional: true })
  coverUrl?: string;

  @Field(() => [String])
  genres: string[];

  @Field(() => String, { enum: ['live', 'retired'] })
  status: 'live' | 'retired';

  /** Lets the shelf mark a shared novel as such; only a caller already cleared to see it receives this. */
  @Field(() => String, { enum: [...NOVEL_VISIBILITIES] })
  visibility: (typeof NOVEL_VISIBILITIES)[number];

  /** On `/shared` this is the novel's last update rather than an add date — nothing was added to a shelf. */
  @Field()
  addedAt: string;
}

@Schema()
export class LibraryListResponse {
  @Field(() => [LibraryItem])
  items: LibraryItem[];
}
