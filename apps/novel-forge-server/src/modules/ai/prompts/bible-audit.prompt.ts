import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { renderOpVocabulary, validateChangeSet } from '../../refinement/change-set';
import { type BibleAuditOutput, BibleAuditSchema } from '../schemas/bible-audit.schema';
import { EDIT_BY_DELETION } from './authoring-preamble';
import { type PromptModule } from './types';

const AUDIT_OPS = ['bible_document.upsert', 'bible_document.remove', 'entity.upsert', 'entity.remove'] as const;

const system =
  'You are a story-bible auditor for a serialized web novel. You receive the premise, the current bible document inventory, the current entity inventory, and the manifest of what a web-novel bible needs.\n\n' +
  'Audit two layers, because a bible is only usable when both hold:\n' +
  '1. DOCUMENTS — for every manifest chapter and every existing document, return a finding keyed `doc:<section>/<slug>`: add (missing and needed — draft its content grounded in the premise), revise (exists but too vague or thin to write chapters from, or missing one of the topics the manifest says it must cover), remove (serves nothing this story needs), or keep.\n' +
  '2. RECORDS — the manifest states, per chapter, which entity types must exist as structured records and how many. Prose that merely describes a character, faction, location or power rule does NOT satisfy that requirement: the Story Bible screen reads records, so canon that exists only inside a document body is invisible to the author and to every downstream generation step. For each entity type whose count falls short, return a finding keyed `entity:<entityKey>` per record you are adding, and stage the `entity.upsert` ops that create them — drawn from what the existing documents already establish, not invented afresh.\n\n' +
  'Judge need against THIS premise, not a generic checklist: a low-fantasy court intrigue does not need a power-progression ladder, and its `power/system-and-limits` finding should come back as a justified remove or keep-absent rather than an add.\n\n' +
  'Never place an unrevealed plot secret in a document body or an entity card — withheld truths belong in canon facts, which this audit does not write.\n\n' +
  `${EDIT_BY_DELETION}\n\n` +
  'Return a changeSet containing the ops for every add and revise. Nothing is applied until the author approves.\n\n' +
  renderOpVocabulary([...AUDIT_OPS]) +
  '\n\nRespond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"findings": [{"ref": "doc:<section>/<slug>" | "entity:<entityKey>", "action": "add|revise|remove|keep", "finding": "..."}], "changeSet": [ops]}';

export const bibleAuditPrompt: PromptModule<BibleAuditOutput> = {
  key: 'bible-audit',
  version: '2.1.0',
  kind: 'analytical',
  role: 'audit',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', '{stableContext}'],
    ['human', 'Current document inventory:\n{docInventory}\n\nCurrent entity inventory:\n{entityInventory}\n\nRequired-bible manifest:\n{manifest}'],
  ]),
  schema: BibleAuditSchema,
  postValidate: data => (data.changeSet.length === 0 ? [] : validateChangeSet(data.changeSet, [...AUDIT_OPS])),
};
