import { type BaseMessage } from '@langchain/core/messages';
import { type ChatPromptTemplate } from '@langchain/core/prompts';
import { type SchemaClass } from '@shadow-library/class-schema';

import { type AiRole } from '../defaults';

export type PromptKey =
  | 'extraction'
  | 'generation'
  | 'judge'
  | 'fix'
  | 'outline'
  | 'title'
  | 'revision'
  | 'continuity'
  | 'chapter-summarize'
  | 'epitome'
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
  | 'ideation-turn'
  | 'ideation-concepts'
  | 'ideation-stress'
  | 'arc-plan'
  | 'chapter-extract'
  | 'rebrand-glossary'
  | 'rebrand-convert'
  | 'rebrand-audit'
  | 'reforge-outline'
  | 'reforge-write'
  | 'reforge-judge'
  | 'reforge-analyze-window'
  | 'reforge-synthesize'
  | 'reforge-plan'
  | 'reforge-transform-write'
  | 'reforge-transform-judge'
  | 'recombine'
  | 'illustration-compose';

/** Mirrors the `reforge_fidelity` enum — how much latitude the re-author has against the source. */
export type ReforgeFidelityLevel = 'preserve' | 'close' | 'loose';

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
