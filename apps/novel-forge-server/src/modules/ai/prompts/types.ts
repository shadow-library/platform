/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type BaseMessage } from '@langchain/core/messages';
import { type ChatPromptTemplate } from '@langchain/core/prompts';
import { type z } from 'zod';

/**
 * Importing user defined packages
 */

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
  | 'bible:volumes';

export interface PromptModule<TOut> {
  key: PromptKey;
  version: string;
  kind: 'authoring' | 'analytical';
  system: string;
  template: ChatPromptTemplate;
  schema: z.ZodType<TOut, z.ZodTypeDef, unknown>;
  fewShots?: BaseMessage[];
}

/**
 * Declaring the constants
 */
