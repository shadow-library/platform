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
import { type GenerationOutput, GenerationSchema } from '../schemas/generation.schema';
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are revising a novel chapter based on editorial feedback. You receive the current draft, the original chapter brief, the established canon context, and specific feedback. Revise the chapter to address all blocking feedback. For suggestions, use your judgement — incorporate them if they strengthen the chapter without violating canon. Maintain the chapter's structure and objectives. Return the complete revised chapter.

If feedback asks you to "wrap up," "resolve," or "finish" a chapter whose brief is marked "[CONTINUES INTO NEXT CHAPTER]", treat that as a request to sharpen the cutoff's clarity and tension — not to resolve the underlying conflict. Preserve the unresolved state and the brief's handoff beat unless the feedback explicitly overrides the brief itself.`;

export const revisionPrompt: PromptModule<GenerationOutput> = {
  key: 'revision',
  version: '1.0.0',
  kind: 'authoring',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\nOriginal brief:\n{chapterBrief}\n\nCurrent draft:\n{draftBody}\n\nEditorial feedback:\n{feedback}'],
  ]),
  schema: GenerationSchema,
};
