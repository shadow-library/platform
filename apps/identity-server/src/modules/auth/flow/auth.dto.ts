/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

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
export class LoginInitBody {
  @Field()
  identifier: string;

  @Field({ optional: true })
  deviceId?: string;
}

@Schema()
export class LoginInitResponse {
  @Field()
  flowId: string;

  @Field()
  status: string;

  @Field()
  hasAlternativeMethods: boolean;
}

@Schema()
export class ChallengeVerifyBody {
  @Field()
  flowId: string;

  @Field({ optional: true })
  password?: string;

  @Field({ optional: true })
  code?: string;
}

@Schema()
export class ChallengeVerifyResponse {
  @Field()
  flowId: string;

  @Field()
  status: string;

  @Field(() => Number, { optional: true })
  attemptsLeft?: number;
}
