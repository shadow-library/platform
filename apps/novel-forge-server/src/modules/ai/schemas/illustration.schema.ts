import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class IllustrationComposeSchema {
  @Field({ minLength: 20, description: 'what the image shows, in one dense descriptive sentence — subject, action, setting, lighting' })
  basePrompt: string;

  @Field({
    minLength: 10,
    description: 'camera framing appropriate to the subject: portrait crop, product shot on a neutral field, wide establishing view, or cover composition with title space',
  })
  subjectFraming: string;

  @Field({ minLength: 10, description: 'medium, palette, rendering style and mood — follows the art-style bible verbatim when one was supplied' })
  styleNotes: string;

  @Field({ optional: true, description: 'comma-separated things the image must not contain; omit when nothing needs excluding' })
  negativePrompt?: string;

  @Field({
    optional: true,
    description: 'for an entity whose canonical appearance was missing, the appearance description you derived from canon — omit entirely when an appearance was supplied',
  })
  appearance?: string;
}

export type IllustrationComposeOutput = IllustrationComposeSchema;
