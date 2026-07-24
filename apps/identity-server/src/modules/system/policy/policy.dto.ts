/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { POLICY_KEYS } from './policy.registry';

/**
 * Defining types
 */

@Schema()
export class OrganisationPolicyParams {
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  organisationId: bigint;
}

@Schema()
export class PolicyKeyParams {
  @Field(() => String, { pattern: '^\\d+$' })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { enum: [...POLICY_KEYS] })
  policyKey: string;
}

/**
 * Every policy in the registry is an integer duration today, so the wire value is a number. A future
 * non-numeric policy adds its own optional field here rather than widening this one.
 */
@Schema()
export class SetPolicyBody {
  @Field(() => Number)
  value: number;
}

@Schema()
export class PolicyItem {
  @Field()
  key: string;

  @Field()
  description: string;

  @Field()
  type: string;

  @Field(() => Number)
  defaultValue: number;

  @Field(() => Number, { optional: true })
  min?: number;

  @Field(() => Number, { optional: true })
  max?: number;

  @Field(() => Number)
  effectiveValue: number;

  /** Absent when the organisation inherits the platform default rather than setting its own value. */
  @Field(() => Number, { optional: true })
  configuredValue?: number;
}

@Schema()
export class PolicyListResponse {
  @Field(() => [PolicyItem])
  policies: PolicyItem[];
}

@Schema()
export class PolicyActionResponse {
  @Field(() => Boolean)
  success: boolean;
}

/**
 * Declaring the constants
 */
