/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type BaseMessage } from '@langchain/core/messages';
import { type ChatPromptTemplate } from '@langchain/core/prompts';
import { type SchemaClass } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { type AiRole } from '../defaults';

/**
 * Defining types
 */

export type PromptKey =
  | 'extraction'
  | 'generation'
  | 'judge'
  | 'fix'
  | 'outline'
  | 'title'
  | 'revision'
  | 'continuity'
  | 'validation'
  | 'review'
  | 'new-novel'
  | 'plan'
  | 'skeleton'
  | 'bible:foundation'
  | 'bible:world-power'
  | 'bible:factions-locations'
  | 'bible:characters'
  | 'bible:plot'
  | 'bible:volumes'
  | 'premise-enhance'
  | 'bible-audit'
  | 'chat-refine'
  | 'chat-compact'
  | 'arc-plan';

export interface PromptModule<TOut> {
  key: PromptKey;
  version: string;
  kind: 'authoring' | 'analytical';
  system: string;
  template: ChatPromptTemplate;
  schema: SchemaClass;
  // Model-routing role when it differs from the key (e.g. key 'chat-refine' routes as role 'chat').
  role?: AiRole;
  // Declares that the template follows the stable-first message convention (refinement design §10.2):
  // static system, then all `stableVars` content in the FIRST human message, volatile content last.
  // The router injects provider cache breakpoints only when this is present.
  cacheStrategy?: { stableVars: string[] };
  // Cross-field/cross-item business rules JSON Schema can't express declaratively (e.g. comparing
  // adjacent array items). Runs after schema validation succeeds; a non-empty return re-enters the repair ladder.
  postValidate?: (data: TOut) => string[];
  fewShots?: BaseMessage[];
}

/**
 * Declaring the constants
 */
