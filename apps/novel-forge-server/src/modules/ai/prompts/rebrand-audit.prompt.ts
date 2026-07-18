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
import { type RebrandAuditOutput, RebrandAuditSchema } from '../schemas/rebrand.schema';
import { type PromptModule } from './types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You audit one converted chapter of a novel that was moved into a fictional alternate world. You receive the world notes, the glossary slice used for the conversion, and the converted prose. Report ONLY violations of these three rules: (a) leftover nationalism or discrimination based on country, ethnicity, or skin color; (b) references to real-world countries, nationalities, cultures, or their unmistakable stand-ins; (c) naming inconsistency against the glossary slice or world notes (a mapped source name still present, a replacement rendered differently, an invented name that clashes with the stated naming conventions). Do not critique prose quality, pacing, or story choices — they are out of scope. When none of the three rules is violated, the verdict is clean and issues is empty.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"verdict": "clean|issues", "issues": [{"type": "nationalism|discrimination|naming|real_world_reference", "detail": string, "excerpt": string}]}';

export const rebrandAuditPrompt: PromptModule<RebrandAuditOutput> = {
  key: 'rebrand-audit',
  version: '1.0.0',
  kind: 'analytical',
  role: 'audit',
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', 'World notes:\n{worldNotes}\n\nGlossary slice:\n{glossarySlice}'],
    ['human', 'Converted chapter:\n{convertedProse}'],
  ]),
  schema: RebrandAuditSchema,
  postValidate: data => {
    if (data.verdict === 'issues' && data.issues.length === 0) return ['verdict "issues" requires at least one issue'];
    if (data.verdict === 'clean' && data.issues.length > 0) return ['verdict "clean" must have an empty issues list'];
    return [];
  },
};
