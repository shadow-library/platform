/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Integer, Schema } from '@shadow-library/class-schema';

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
export class AiModelOption {
  @Field()
  id: string;

  @Field()
  provider: string;

  @Field()
  label: string;

  @Field(() => String, { enum: ['llm', 'embedding', 'image'] })
  kind: string;

  // false for subprocess providers whose server flag is off — the picker shows them disabled.
  @Field()
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
  // The active server profile ('production' | 'local-test'); roles left unset inherit its defaults.
  @Field()
  profile: string;

  @Field(() => [AiModelOption])
  models: AiModelOption[];

  @Field(() => [AiRoleDefault])
  defaults: AiRoleDefault[];
}
