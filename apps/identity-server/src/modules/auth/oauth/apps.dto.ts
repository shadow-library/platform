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
export class ApplicationGrantItem {
  @Field()
  audience: string;

  @Field(() => [String])
  scopes: string[];
}

/**
 * What an application reads back about itself instead of restating it in environment variables
 * (D-21 §8.6). Everything here is derived from the registration identity already holds, so an admin
 * granting a scope reaches the consumer on its next refresh rather than on its next deploy.
 */
@Schema()
export class ApplicationSelfResponse {
  /** Named `appId` because that is the SDK's `AppRegistration` contract — the value a consumer sets as `AUTH_APP_ID`. */
  @Field()
  appId: string;

  /** Display name, so a consumer can label itself without a second lookup. */
  @Field({ optional: true })
  name?: string;

  @Field(() => Boolean)
  isFirstParty: boolean;

  /** Absent only for an application whose API resource has not been provisioned yet. */
  @Field({ optional: true })
  audience?: string;

  @Field(() => [String])
  redirectUris: string[];

  @Field(() => [String])
  scopes: string[];

  /** Scopes that mint only into a stepped-up token (D-19); listed apart so a client never asks blind. */
  @Field(() => [String])
  sensitiveScopes: string[];

  /** Grants on *other* applications — the ceiling for a delegated call (D-22). */
  @Field(() => [ApplicationGrantItem])
  grants: ApplicationGrantItem[];

  @Field(() => Number)
  accessTokenTtl: number;
}
