import { Field, Integer, Schema } from '@shadow-library/class-schema';

@Schema()
export class AiModelOption {
  @Field()
  id: string;

  @Field()
  provider: string;

  @Field()
  label: string;

  @Field(() => String, { enum: ['llm', 'embedding', 'image'] })
  kind: string;

  @Field({ description: 'Whether the server can currently route requests to this model.' })
  enabled: boolean;

  @Field(() => Integer, { optional: true })
  contextWindow?: number;

  @Field(() => Number, { optional: true })
  inputPricePerMToken?: number;

  @Field(() => Number, { optional: true })
  outputPricePerMToken?: number;

  @Field({ optional: true })
  supportsTools?: boolean;

  @Field({ optional: true })
  supportsStructuredOutput?: boolean;
}

@Schema()
export class AiRoleDefault {
  @Field()
  role: string;

  @Field()
  provider: string;

  @Field()
  model: string;
}

@Schema()
export class AiModelsResponse {
  @Field({ description: "The active server profile. Roles without an override inherit this profile's defaults." })
  profile: string;

  @Field(() => [AiModelOption])
  models: AiModelOption[];

  @Field(() => [AiRoleDefault])
  defaults: AiRoleDefault[];
}
