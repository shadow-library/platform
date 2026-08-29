import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { type Genre } from '@shadow-library/sdk';

import { NovelGenre } from '@server/classes';
import { NOVEL_VISIBILITIES } from '@server/modules/publish';

@Schema()
export class ProgressBody {
  @Field(() => Integer, { minimum: 1 })
  ordinal: number;

  @Field({ minimum: 0, description: 'Scroll offset within the chapter as reported by the reader client.' })
  position: number;
}

@Schema()
export class ProgressResponse {
  @Field(() => Integer)
  ordinal: number;

  @Field()
  position: number;

  @Field(() => Integer, { description: 'Furthest chapter ever reached; it does not decrease when rereading earlier chapters.' })
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

  @Field(() => String, { optional: true, description: "The work's own author; absent when the publisher did not supply one." })
  author?: string;

  @Field(() => String, { optional: true, description: 'Absolute public URL; absent when the novel has no cover.' })
  coverUrl?: string;

  @Field(() => [NovelGenre])
  genres: Genre[];

  @Field(() => String, { enum: ['live', 'retired'] })
  status: 'live' | 'retired';

  @Field(() => String, { enum: [...NOVEL_VISIBILITIES], description: 'The access tier already authorized for the caller.' })
  visibility: (typeof NOVEL_VISIBILITIES)[number];

  @Field({ description: "Shelf addition time; on /shared, this is the novel's last update time." })
  addedAt: string;
}

@Schema()
export class LibraryListResponse {
  @Field(() => [LibraryItem])
  items: LibraryItem[];
}
