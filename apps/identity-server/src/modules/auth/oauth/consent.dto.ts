import { Field, Schema } from '@shadow-library/class-schema';

import { PATTERN } from '@server/constants';

@Schema()
export class ConsentPromptQuery {
  @Field()
  clientId: string;

  @Field({ description: 'Space-delimited scope string exactly as supplied on the authorization request.' })
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

  @Field(() => Boolean, { description: 'Whether active consent already covers every requested scope, allowing the UI to skip the prompt.' })
  isFirstParty: boolean;

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

  @Field({ optional: true, description: 'Required for DENY so the server can validate the URI and construct the error redirect.' })
  redirectUri?: string;

  @Field({ optional: true })
  state?: string;
}

@Schema()
export class ConsentDecisionResponse {
  @Field(() => String, { enum: ['APPROVE', 'DENY'] })
  decision: 'APPROVE' | 'DENY';

  @Field({ optional: true, description: 'For DENY decisions, the validated client redirect carrying error=access_denied.' })
  redirectTo?: string;
}

@Schema()
export class ConsentClientParams {
  @Field({ ...PATTERN.CLIENT_ID, description: 'Admin-chosen client identifier slug; legacy lowercase UUIDs are also accepted.' })
  clientId: string;
}

@Schema()
export class ConsentRecordDto {
  @Field()
  clientId: string;

  @Field()
  clientName: string;

  @Field({ description: 'User-facing name of the application to which the client belongs.' })
  applicationName: string;

  @Field(() => [String])
  scopeNames: string[];

  @Field(() => String, { enum: ['USER', 'FIRST_PARTY_POLICY', 'ADMIN'] })
  source: 'USER' | 'FIRST_PARTY_POLICY' | 'ADMIN';

  @Field()
  grantedAt: string;
}

@Schema()
export class ConsentRecordsResponse {
  @Field(() => [ConsentRecordDto])
  items: ConsentRecordDto[];
}

@Schema()
export class ConsentOperationResponse {
  @Field(() => Boolean)
  success: boolean;
}
