/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { PATTERN } from '@server/constants';
import { POLICY_KEYS } from './policy.registry';

/**
 * Defining types
 */

@Schema()
export class OrganisationPolicyParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;
}

@Schema()
export class PolicyKeyParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  organisationId: bigint;

  @Field(() => String, { enum: [...POLICY_KEYS] })
  policyKey: string;
}

/**
 * A policy is either an integer duration or a boolean switch, and class-schema has no scalar union,
 * so each value type gets its own optional field. The key's registry entry decides which one is
 * read; sending the wrong field, or neither, fails validation as `POL_002`.
 */
@Schema()
export class SetPolicyBody {
  @Field(() => Number, { optional: true })
  value?: number;

  @Field(() => Boolean, { optional: true })
  enabled?: boolean;
}

/** Mirrors `SetPolicyBody`: the `*Value` trio describes an `integer` key, the `*Enabled` trio a `boolean` one. */
@Schema()
export class PolicyItem {
  @Field()
  key: string;

  /** The setting's name; `description` explains it underneath. */
  @Field()
  label: string;

  @Field()
  description: string;

  @Field()
  type: string;

  @Field(() => Number, { optional: true })
  defaultValue?: number;

  @Field(() => Number, { optional: true })
  min?: number;

  @Field(() => Number, { optional: true })
  max?: number;

  @Field(() => Number, { optional: true })
  effectiveValue?: number;

  /** Absent when the organisation inherits the platform default rather than setting its own value. */
  @Field(() => Number, { optional: true })
  configuredValue?: number;

  @Field(() => Boolean, { optional: true })
  defaultEnabled?: boolean;

  @Field(() => Boolean, { optional: true })
  effectiveEnabled?: boolean;

  /** Absent when the organisation inherits the platform default rather than setting its own value. */
  @Field(() => Boolean, { optional: true })
  configuredEnabled?: boolean;
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
