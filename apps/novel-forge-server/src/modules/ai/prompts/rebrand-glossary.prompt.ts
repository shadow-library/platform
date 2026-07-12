/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * Importing user defined packages
 */
import { type PromptModule } from './types';
import { type RebrandGlossarySeedOutput, RebrandGlossarySeedSchema } from '../schemas/rebrand.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You design the rename bible for moving a translated Chinese web novel into a fictional alternate world. You receive the project overview (title, premise, known entities and world facts) and the opening chapters. Produce two things.\n\n' +
  'First, worldNotes: the alternate-world bible a future rewriter will follow. Invent a fictional nation, culture, or region for EVERY real-world nation, ethnicity, and culture the source references or implies (China and its dynasties, Japan, Korea, "the West", and so on) — never reuse a real country, people, or place name. Cover geography, the naming convention of each invented culture (so new names can be coined consistently later), what replaced each real-world reference, and the overall tone.\n\n' +
  'Second, mappings: one entry per proper noun in the provided material — characters, places, sects, factions, techniques, items, currencies, and recurring idioms. Replacements are English/alternate-world names; keeping a faint phonetic echo of the original is welcome when it reads naturally, but never keep pinyin as-is. For each mapping list the romanization variants and likely misspellings the source uses in `variants`, and say who or what it is in `notes`.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"worldNotes": string, "mappings": [{"sourceName": string, "variants": [string], "replacement": string, "category": "character|place|country|culture|faction|technique|item|term", "notes": string}]}';

export const rebrandGlossaryPrompt: PromptModule<RebrandGlossarySeedOutput> = {
  key: 'rebrand-glossary',
  version: '1.0.0',
  kind: 'analytical',
  role: 'rebrand',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{contextPack}'], ['human', 'Opening chapters:\n{openingChapters}']]),
  schema: RebrandGlossarySeedSchema,
};
