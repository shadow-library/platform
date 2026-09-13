import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type TranslationSeedOutput, TranslationSeedSchema } from '../schemas/translation.schema';
import { type PromptModule } from './types';

const system =
  'You set up the translation of a web novel into English. You receive the project overview (title, premise, known entities and world facts) and a sample of the original chapters. Produce two things.\n\n' +
  'First, styleNotes: the guide every later chapter will be translated against. Fix the narrative voice and tense, the honorific policy (kept, dropped, or rendered as an English equivalent), name order (family name first or last, and whether it varies by character), how units, currency and measurements are handled, how system windows, status screens and skill descriptions are formatted, and the dialogue punctuation and paragraphing conventions the English text will use. Decide each one — a style note that offers the translator a choice is worthless.\n\n' +
  'Second, terms: one entry per novel-specific term the sample contains — characters, places, organizations, professions, titles, ranks, abilities, items, creatures, and any recurring coined term. For each, give the source term exactly as written and the other spellings the original uses in `variants`, say what it is in one phrase in `meaning`, quote the sentence it first appears in as `contextExcerpt`, choose the `treatment` (translate the sense, localize to a natural English equivalent, transliterate the sound, or preserve the original characters), propose the `target`, and list any rendering a reviewer might reasonably prefer in `alternatives` with the reason. Ordinary words that any translator would render the same way are not terms — leave them out.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"styleNotes": string, "terms": [{"sourceTerm": string, "variants": [string], "target": string, "alternatives": [{"target": string, "rationale": string}], "category": "character|place|organization|profession|title|rank|ability|item|creature|term", "treatment": "translate|localize|transliterate|preserve", "meaning": string, "contextExcerpt": string}]}';

export const translateSeedPrompt: PromptModule<TranslationSeedOutput> = {
  key: 'translate-seed',
  version: '1.0.0',
  kind: 'analytical',
  role: 'translate',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', '{contextPack}'],
    ['human', 'Sample chapters (original language: {language}):\n{sampleChapters}'],
  ]),
  schema: TranslationSeedSchema,
};
