/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * First-party interaction DTOs for the consent screen, so they use the project's camelCase
 * convention rather than the OAuth wire format.
 */

@Schema()
export class ConsentPromptQuery {
  @Field()
  clientId: string;

  /** Space-delimited scope string exactly as it appears on the authorize request. */
  @Field()
  scope: string;
}

@Schema()
export class ConsentScopeDto {
  @Field()
  name: string;

  @Field({ optional: true })
  description?: string;

  @Field(() => Boolean)
  isSensitive: boolean;
}

@Schema()
export class ConsentPromptResponse {
  @Field()
  clientName: string;

  @Field(() => Boolean)
  isFirstParty: boolean;

  /** True when an active consent already covers every requested scope — the UI can skip the prompt. */
  @Field(() => Boolean)
  alreadyGranted: boolean;

  @Field(() => [ConsentScopeDto])
  scopes: ConsentScopeDto[];
}

@Schema()
export class ConsentDecisionBody {
  @Field()
  clientId: string;

  @Field(() => [String])
  scopeNames: string[];

  @Field(() => String, { enum: ['APPROVE', 'DENY'] })
  decision: 'APPROVE' | 'DENY';

  /** Required on DENY so the server can build the error redirect after validating the URI. */
  @Field({ optional: true })
  redirectUri?: string;

  @Field({ optional: true })
  state?: string;
}

@Schema()
export class ConsentDecisionResponse {
  @Field(() => String, { enum: ['APPROVE', 'DENY'] })
  decision: 'APPROVE' | 'DENY';

  /** On DENY, the validated client redirect carrying `error=access_denied`. */
  @Field({ optional: true })
  redirectTo?: string;
}
