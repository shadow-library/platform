import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class ChapterExpandSchema {
  @Field({ minLength: 100, description: 'the complete expanded chapter prose — every scene of the draft, same events and same final beat, lengthened to the requested size' })
  body: string;
}

export type ChapterExpandOutput = ChapterExpandSchema;
