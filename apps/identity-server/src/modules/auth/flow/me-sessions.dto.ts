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

/**
 * Declaring the constants
 */

@Schema()
export class SessionIdParams {
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  sessionId: bigint;
}

@Schema()
export class MeSessionItem {
  @Field(() => String)
  id: bigint;

  @Field(() => String, { enum: ['AAL1', 'AAL2'] })
  aal: 'AAL1' | 'AAL2';

  @Field()
  createdAt: string;

  @Field()
  lastUsedAt: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  ipAddress?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  ipCountry?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  userAgent?: string;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  deviceName?: string;

  /** Marks the session making this request. */
  @Field(() => Boolean)
  isCurrent: boolean;
}

@Schema()
export class MeSessionsResponse {
  @Field(() => [MeSessionItem])
  sessions: MeSessionItem[];
}

@Schema()
export class SessionsRevokedResponse {
  @Field(() => Number)
  revoked: number;
}
