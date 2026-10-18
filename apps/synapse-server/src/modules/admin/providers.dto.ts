import { Field, Integer, Schema } from '@shadow-library/class-schema';

@Schema()
export class ProviderResponse {
  @Field({ description: 'Key of the provider in the catalog' })
  key: string;

  @Field()
  kind: string;

  @Field({ optional: true })
  flavor?: string;

  @Field({ description: 'Endpoint URL with any embedded credentials removed' })
  url: string;

  @Field()
  locality: string;

  @Field()
  cost: string;

  @Field(() => [String])
  features: string[];

  @Field(() => Integer, { optional: true })
  maxInflightPerReplica?: number;

  @Field({ optional: true, description: 'Id of the stored credential the provider sends; see /api/v1/admin/credentials' })
  credential?: string;

  @Field({ optional: true, description: "Deprecated with apiKeyConfig: whether the Config key naming the provider's API key holds a value. The value itself is never returned" })
  apiKeyConfigured?: boolean;

  @Field(() => Integer, {
    description: 'Requests this provider answered in the window, successfully or with an error. Refused and cancelled requests, and failovers to other providers, are not counted',
  })
  calls: number;

  @Field(() => Integer)
  errors: number;

  @Field({ optional: true, description: 'errors / calls; absent when there were no calls' })
  errorRate?: number;
}

@Schema()
export class ProvidersResponse {
  @Field(() => Integer, { description: 'Version of the active catalog the providers come from' })
  catalogVersion: number;

  @Field(() => Integer, { description: 'Length of the window `calls`, `errors` and `errorRate` cover' })
  windowHours: number;

  @Field(() => [ProviderResponse])
  providers: ProviderResponse[];
}
