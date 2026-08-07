import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class ApplicationGrantItem {
  @Field()
  audience: string;

  @Field(() => [String])
  scopes: string[];
}

@Schema()
export class ApplicationSelfResponse {
  @Field({ description: 'Application identifier used by SDK consumers as AUTH_APP_ID.' })
  appId: string;

  @Field({ optional: true, description: 'Application display name for consumer-facing labels.' })
  name?: string;

  @Field(() => Boolean)
  isFirstParty: boolean;

  @Field({ optional: true, description: 'Application API audience; absent only when its API resource has not yet been provisioned.' })
  audience?: string;

  @Field(() => [String])
  redirectUris: string[];

  @Field(() => [String])
  scopes: string[];

  @Field(() => [String], { description: 'Scopes minted only into stepped-up tokens, listed separately so clients can request them intentionally.' })
  sensitiveScopes: string[];

  @Field(() => [ApplicationGrantItem], { description: 'Grants on other applications that form the ceiling for delegated calls.' })
  grants: ApplicationGrantItem[];

  @Field(() => Number)
  accessTokenTtl: number;
}
