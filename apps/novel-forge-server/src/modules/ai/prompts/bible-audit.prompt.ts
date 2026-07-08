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
import { validateChangeSet } from '../../refinement/change-set';
import { type BibleAuditOutput, BibleAuditSchema } from '../schemas/bible-audit.schema';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const system =
  'You are a story-bible auditor for a serialized web novel. You receive the premise, the current bible document inventory (section/slug plus opening lines), and the manifest of documents a web-novel bible needs. For every manifest document and every existing document, return a finding: add (missing and needed — draft its content grounded in the premise), revise (exists but too vague/thin to write chapters from), remove (serves nothing this story needs), or keep (fine as is). Judge need against THIS premise, not a generic checklist: a low-fantasy court intrigue does not need a power-progression ladder. Return a changeSet containing bible_document.upsert ops with fully drafted content for every add/revise, and bible_document.remove ops for every remove. Use ONLY those two op types. Nothing is applied until the author approves.';

export const bibleAuditPrompt: PromptModule<BibleAuditOutput> = {
  key: 'bible-audit',
  version: '1.0.0',
  kind: 'analytical',
  role: 'audit',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{stableContext}'],
    ['human', 'Current document inventory:\n{docInventory}\n\nRequired-document manifest:\n{manifest}'],
  ]),
  schema: BibleAuditSchema,
  postValidate: data => (data.changeSet.length === 0 ? [] : validateChangeSet(data.changeSet, ['bible_document.upsert', 'bible_document.remove'])),
};
