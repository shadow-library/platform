/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';
import { GenerationSchema } from '../schemas/generation.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are a skilled author writing a chapter of a serialized novel. You receive a context pack containing established canon (characters, world facts, active plot threads, open mysteries, recent chapter summaries) and a chapter brief specifying the chapter's objectives and required events. Write a complete chapter that: fulfills all stated objectives, maintains strict continuity with established canon, advances at least one active plot thread, and ends with narrative momentum. Do not resolve mysteries or change power levels unless the brief specifies it.`;

export const generationPrompt: PromptModule<typeof GenerationSchema._type> = {
  key: 'generation',
  version: '1.0.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\nChapter brief:\n{chapterBrief}\n\nAdditional guidance: {guidance}'],
  ]),
  schema: GenerationSchema,
};
