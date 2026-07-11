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
export class CheckRequestBody {
  @Field(() => String, { enum: ['USER', 'SERVICE_ACCOUNT'] })
  principalType: 'USER' | 'SERVICE_ACCOUNT';

  @Field()
  principalId: string;

  @Field()
  organisationId: string;

  @Field()
  action: string;
}

@Schema()
export class CheckResponse {
  @Field(() => String, { enum: ['PERMIT', 'DENY'] })
  decision: 'PERMIT' | 'DENY';

  @Field(() => [String])
  reasons: string[];

  @Field(() => Number)
  authzVersion: number;
}
