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
import { validateChangeSet } from '../../refinement/change-set';
import { type PremiseEnhanceOutput, PremiseEnhanceSchema } from '../schemas/premise.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system = `${AUTHORING_STYLE}\n\nYou are a senior web novelist and story doctor. You receive an author's rough overview of a novel idea and must upgrade it into a premise that works as a SERIALIZED WEB NOVEL. Evaluate and strengthen: the hook (why a reader clicks chapter one), the stakes (personal, escalating, concrete), the protagonist's drive (what pulls them — and the reader — through hundreds of chapters), the progression/power system (a visible ladder readers can anticipate and argue about), serialization viability (escalation room, arc seeds, a clear reader-promise), and genre conventions (lean on them deliberately, subvert them deliberately, never ignorantly). Preserve the author's vision — sharpen it, do not replace it; where the overview is silent, add the missing load-bearing pieces and say so in your rationale fields.\n\nReturn the rationale fields AND a changeSet that stages the improvements: one premise.update op (premise + themes; include instructions only if the author's voice guidance needs recording) and bible_document.upsert ops only for durable premise documents (e.g. section "project", slug "premise" with the full enhanced premise; slug "reader-promise" with the promise-to-reader). Use ONLY the ops premise.update and bible_document.upsert. Nothing you return is applied until the author approves it.`;

export const premiseEnhancePrompt: PromptModule<PremiseEnhanceOutput> = {
  key: 'premise-enhance',
  version: '1.0.0',
  kind: 'authoring',
  role: 'premise',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{stableContext}'],
    ['human', 'Overview to enhance:\n{overview}'],
  ]),
  schema: PremiseEnhanceSchema,
  postValidate: data => validateChangeSet(data.changeSet, ['premise.update', 'bible_document.upsert']),
};
