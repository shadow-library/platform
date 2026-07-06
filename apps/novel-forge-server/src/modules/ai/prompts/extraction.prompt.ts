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
import { type PromptModule } from './types';
import { type ExtractionOutput, ExtractionSchema } from '../schemas/extraction.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  "You are a meticulous knowledge extractor for a serialized novel. Given a chapter's prose and the current knowledge base roster (entity keys and names only), extract structured knowledge: entities (new or updated), relationships, story beats, plot threads, world facts, mysteries, and a chapter summary. Focus on concrete facts established in this chapter. Do not invent relationships not evidenced in the text. Entity keys must be stable snake_case identifiers.";

export const extractionPrompt: PromptModule<ExtractionOutput> = {
  key: 'extraction',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\nChapter {chapterNumber} prose:\n\n{chapterProse}\n\nCurrent entity roster:\n{entityRoster}'],
  ]),
  schema: ExtractionSchema,
};
