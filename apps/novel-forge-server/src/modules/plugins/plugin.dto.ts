import { EnumType, Field, Schema } from '@shadow-library/class-schema';

import { ACTION_SURFACES, DECISION_POINTS } from './plugin-loader';
import { type DecisionPoint, type PluginAction } from './plugin.types';

const DecisionPointEnum = EnumType.create('DecisionPoint', [...DECISION_POINTS]);
const ActionSurfaceEnum = EnumType.create('PluginActionSurface', [...ACTION_SURFACES]);

@Schema({ description: 'An author-triggered action the plugin surfaces in the UI. Invoking one is not yet supported.' })
export class PluginActionResponse {
  @Field()
  id: string;

  @Field({ description: 'Operation name passed back to the plugin when the action runs.' })
  op: string;

  @Field()
  label: string;

  @Field(() => ActionSurfaceEnum, { description: 'Where the action is offered.' })
  surface: PluginAction['surface'];

  @Field({ optional: true, description: 'Name of the manifest form collecting arguments for this action.' })
  form?: string;
}

@Schema({ description: 'Manifest of one plugin loaded on this deploy.' })
export class PluginManifestResponse {
  @Field({ description: 'Stable plugin identifier, equal to its directory name under the deployment plugin directory.' })
  id: string;

  @Field({ description: 'Manifest version the stored per-novel config is validated against.' })
  version: string;

  @Field()
  title: string;

  @Field()
  description: string;

  @Field(() => [DecisionPointEnum], { description: 'Pipeline decision points this plugin answers.' })
  decisionPoints: DecisionPoint[];

  @Field(() => [DecisionPointEnum], {
    optional: true,
    description: 'Decision points claimed exclusively — a second plugin claiming one of these cannot be enabled on the same novel.',
  })
  exclusive?: DecisionPoint[];

  @Field(() => Object, { additionalProperties: true, description: 'Declared forms keyed by name; `settings` is the per-novel configuration form rendered from its field list.' })
  forms: Record<string, unknown>;

  @Field(() => [PluginActionResponse], { optional: true })
  actions?: PluginAction[];
}
