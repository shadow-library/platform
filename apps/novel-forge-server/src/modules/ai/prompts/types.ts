import { type BaseMessage } from '@langchain/core/messages';
import { type ChatPromptTemplate } from '@langchain/core/prompts';
import { type SchemaClass } from '@shadow-library/class-schema';

import { type AiRole } from '../defaults';

export type PromptKey =
  | 'generation'
  | 'chapter-expand'
  | 'judge'
  | 'fix'
  | 'outline'
  | 'title'
  | 'revision'
  | 'continuity'
  | 'chapter-summarize'
  | 'validation'
  | 'review'
  | 'new-novel'
  | 'bible:foundation'
  | 'bible:world'
  | 'bible:power'
  | 'bible:factions-locations'
  | 'bible:characters'
  | 'bible:plot'
  | 'bible:volumes'
  | 'premise-enhance'
  | 'bible-audit'
  | 'bible-contradiction'
  | 'chat-refine'
  | 'chat-compact'
  | 'chat-title'
  | 'chapter-extract'
  | 'illustration-compose'
  | 'appearance-describe'
  | 'notes-organise'
  | 'chapter-plan';

export interface PromptModule<TOut> {
  key: PromptKey;
  version: string;
  kind: 'authoring' | 'analytical';
  system: string;
  template: ChatPromptTemplate;
  schema: SchemaClass;
  // Model-routing role when it differs from the key (e.g. key 'chat-refine' routes as role 'chat').
  role?: AiRole;
  // Declares that the template follows the stable-first message convention:
  // static system, then all `stableVars` content in the FIRST human message, volatile content last.
  // The router injects provider cache breakpoints only when this is present.
  cacheStrategy?: { stableVars: string[] };
  // Cross-field/cross-item business rules JSON Schema can't express declaratively (e.g. comparing
  // adjacent array items). Runs after schema validation succeeds; a non-empty return re-enters the repair ladder.
  postValidate?: (data: TOut) => string[];
  // Rules worth one repair but never a failure: issues found on the first attempt join the repair request, and whatever
  // the repair or tolerant extraction returns is accepted. The caller re-runs the rule on the result to surface what remains.
  advise?: (data: TOut) => string[];
  fewShots?: BaseMessage[];
}
