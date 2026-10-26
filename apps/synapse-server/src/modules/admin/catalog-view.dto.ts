import { Field, Integer, Schema } from '@shadow-library/class-schema';
import { type SynapseEffort } from '@shadow-library/synapse';

@Schema()
export class CatalogQuery {
  @Field({ optional: true, maxLength: 200, description: 'Task key `<app>.<name>`. Omit it to receive every task of the calling app' })
  task?: string;

  @Field({ optional: true, maxLength: 1024, description: 'Routing selectors as `key:value` pairs separated by commas, e.g. `tier:performant,content_mode:standard`' })
  selectors?: string;
}

@Schema()
export class CatalogPriceView {
  @Field({ description: 'List price per million input tokens, in USD' })
  input: number;

  @Field({ optional: true, description: 'List price per million cached input tokens, in USD' })
  cachedInput?: number;

  @Field({ description: 'List price per million output tokens, in USD' })
  output: number;

  @Field({ optional: true, description: 'List price per generated image, in USD' })
  perImage?: number;
}

@Schema()
export class CatalogEmbeddingView {
  @Field(() => Integer)
  dimensions: number;
}

@Schema()
export class CatalogCapabilitiesView {
  @Field()
  tools: boolean;

  @Field(() => String, { enum: ['native', 'prompt'] })
  structuredOutput: 'native' | 'prompt';

  @Field()
  vision: boolean;

  @Field({ optional: true })
  imageOutput?: boolean;

  @Field(() => CatalogEmbeddingView, { optional: true })
  embedding?: CatalogEmbeddingView;

  @Field(() => Integer, { optional: true, description: 'Context window in tokens' })
  context?: number;

  @Field(() => String, { enum: ['none', 'optional', 'mandatory'] })
  reasoning: 'none' | 'optional' | 'mandatory';

  @Field(() => [String], { optional: true, description: 'Reasoning efforts the model accepts, e.g. low, medium, high' })
  efforts?: SynapseEffort[];

  @Field(() => String, { enum: ['anthropic', 'none'] })
  promptCache: 'anthropic' | 'none';

  @Field()
  sampling: boolean;
}

@Schema()
export class CatalogModelView {
  @Field()
  model: string;

  @Field()
  label: string;

  @Field(() => CatalogPriceView)
  price: CatalogPriceView;

  @Field(() => CatalogCapabilitiesView)
  capabilities: CatalogCapabilitiesView;
}

@Schema()
export class CatalogAliasView {
  @Field()
  key: string;

  @Field({ description: 'Includes the model version only when the alias opts in to showing it' })
  label: string;

  @Field({ optional: true })
  description?: string;

  @Field({ description: 'The catalog model the alias targets, as the `model` of a response it serves' })
  model: string;

  @Field(() => CatalogPriceView)
  price: CatalogPriceView;

  @Field(() => CatalogCapabilitiesView)
  capabilities: CatalogCapabilitiesView;

  @Field(() => String, { enum: ['active', 'hidden', 'retired'] })
  state: 'active' | 'hidden' | 'retired';

  @Field({
    description:
      "Whether a chat on the alias's model can search the web: its first eligible deployment searches by itself, or Synapse runs its own search for a request that brings no tools",
  })
  web_search: boolean;
}

@Schema()
export class CatalogTaskView {
  @Field(() => CatalogModelView, { description: 'The model the task routes to for the requested selectors' })
  default: CatalogModelView;

  @Field(() => [CatalogAliasView], { description: 'Only the active aliases the task accepts and the selectors allow' })
  aliases: CatalogAliasView[];

  @Field({
    description:
      'Whether a chat on the default model can search the web: its first eligible deployment searches by itself, or Synapse runs its own search for a request that brings no tools',
  })
  web_search: boolean;
}

@Schema({ description: 'One task when `task` is given (`task` and the task view at the top level), else every task of the calling app under `tasks`' })
export class CatalogResponseDto {
  @Field(() => Integer)
  catalog_version: number;

  @Field({ optional: true })
  task?: string;

  @Field(() => CatalogModelView, { optional: true })
  default?: CatalogModelView;

  @Field(() => [CatalogAliasView], { optional: true })
  aliases?: CatalogAliasView[];

  @Field({ optional: true })
  web_search?: boolean;

  @Field({ optional: true, additionalProperties: true, description: 'Task views keyed by task key, each shaped as CatalogTaskView' })
  tasks?: Record<string, CatalogTaskView>;
}
