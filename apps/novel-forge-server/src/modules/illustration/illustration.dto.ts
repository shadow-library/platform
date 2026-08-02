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

/**
 * Defining types
 */

@Schema()
export class IllustrationParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;

  @Field()
  entityKey: string;
}

@Schema()
export class StartIllustrationBody {
  @Field({ optional: true })
  instruction?: string;

  @Field({ optional: true })
  noChat?: boolean;
}

@Schema()
export class RefineIllustrationBody {
  @Field()
  sessionId: string;

  @Field()
  instruction: string;
}

@Schema()
export class SaveIllustrationBody {
  @Field()
  sessionId: string;
}

@Schema()
export class CancelIllustrationBody {
  @Field()
  sessionId: string;
}

/**
 * Declaring the constants
 */

@Schema()
export class StartIllustrationResponse {
  @Field()
  sessionId: string;

  @Field()
  previewUrl: string;
}

@Schema()
export class RefineIllustrationResponse {
  @Field()
  previewUrl: string;
}

@Schema()
export class SaveIllustrationResponse {
  @Field()
  saved: boolean;

  // Absolute public object-storage URL, resolved server-side from the runtime `storage.public-origin`.
  @Field()
  imageUrl: string;
}

@Schema()
export class CancelIllustrationResponse {
  @Field()
  cancelled: boolean;
}
