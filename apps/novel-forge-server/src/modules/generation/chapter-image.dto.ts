import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

@Schema()
export class ChapterImageParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field(() => Integer)
  n: number;

  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  imageId: bigint;
}

@Schema()
export class AddChapterImageBody {
  @Field(() => String, { enum: ['image/png', 'image/jpeg', 'image/webp'] })
  mime: 'image/png' | 'image/jpeg' | 'image/webp';

  @Field({ description: 'Base64-encoded image bytes without a data URL prefix.' })
  image: string;

  @Field({ optional: true })
  caption?: string;
}

@Schema()
export class ChapterImageResponse {
  @Field(() => String)
  id: bigint;

  @Field(() => String)
  projectId: bigint;

  @Field(() => Integer)
  chapter: number;

  @Field({ description: 'Absolute public URL for the stored scene image.' })
  imageUrl: string;

  @Field({ optional: true, nullable: true })
  caption?: string | null;

  @Field(() => Integer)
  sortOrder: number;

  @Field(() => String, { format: 'date-time' })
  createdAt: Date;
}

@Schema()
export class ListChapterImageResponse {
  @Field(() => [ChapterImageResponse])
  items: ChapterImageResponse[];
}
