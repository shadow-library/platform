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

  @Field(() => String, { optional: true })
  coverPath?: string;

  @Field(() => [String])
  genres: string[];

  @Field(() => String, { enum: ['live', 'retired'] })
  status: 'live' | 'retired';

  @Field()
  addedAt: string;
}

@Schema()
export class LibraryListResponse {
  @Field(() => [LibraryItem])
  items: LibraryItem[];
}
