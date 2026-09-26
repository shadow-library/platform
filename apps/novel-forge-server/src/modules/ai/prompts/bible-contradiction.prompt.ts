import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { renderOpVocabulary, validateChangeSet } from '../../refinement/change-set';
import { type BibleContradictionOutput, BibleContradictionSchema } from '../schemas/bible-contradiction.schema';
import { type PromptModule } from './types';

export const CONTRADICTION_OPS = ['bible_document.upsert', 'entity.upsert', 'fact.upsert'] as const;

const system =
  'You check a serialized web novel’s Story Bible for contradictions. You receive, each under its own label: the Story Bible pages (`doc:<section>/<slug>`), the entity records (`entity:<key>`), the canon facts (`fact:<key>`) and the summaries of the finalized chapters (`chapter:<n>`).\n\n' +
  'Report a contradiction only when two of these sources — or two passages of one — state things that cannot both be true: a name, age, rank, rule, place, date, relationship or event told two incompatible ways. A gap, a vague page, a missing record or a style note is not a contradiction; another check covers those. A character who changes over the story is not contradicting themselves when the change happens in a chapter.\n\n' +
  'Evidence: cite every source on each side by its label, and copy the conflicting words verbatim from the material — never paraphrase a quote, never cite a label that is not in the material.\n\n' +
  'Finalized chapters already happened and readers have read them: when a chapter summary and the Story Bible disagree, the fix belongs in the Story Bible. Never propose a change to a chapter.\n\n' +
  'Secrets: a fact marked SECRET is a truth the reader has not been told. A page, record or chapter that tells the cover story, or what the characters believe, while the secret says otherwise is the disclosure plan working — not a contradiction. Report a secret only when two sources disagree about the secret itself. Never write a secret’s truth into a page, an entity record, a fact’s writerNote or its allowedClues: the chapter writer reads those. A secret’s truth may only change in that fact’s own body.\n\n' +
  'For each contradiction, stage the smallest ops that make the sources agree, siding with the finalized chapters, then with the canon facts. Leave changeSet empty when only the author can decide which side is right. Nothing is applied until the author approves.\n\n' +
  renderOpVocabulary([...CONTRADICTION_OPS]) +
  '\n\nRespond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"contradictions": [{"finding": "...", "evidence": [{"ref": "doc:<section>/<slug>" | "entity:<key>" | "fact:<key>" | "chapter:<n>", "quote": "..."}], "changeSet": [ops]}]}\n' +
  'Return {"contradictions": []} when the sources agree.';

export const bibleContradictionPrompt: PromptModule<BibleContradictionOutput> = {
  key: 'bible-contradiction',
  version: '1.0.0',
  kind: 'analytical',
  role: 'audit',
  cacheStrategy: { stableVars: ['material'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{material}'], ['human', 'List every contradiction in the material above.']]),
  schema: BibleContradictionSchema,
  // Contradiction fixes correct records that already exist, so they are not held to the rule that new canon pages bring their records.
  postValidate: data =>
    data.contradictions.flatMap((item, index) =>
      item.changeSet.length === 0
        ? []
        : validateChangeSet(item.changeSet, [...CONTRADICTION_OPS], { entityMaterialization: false }).map(error => `contradictions[${index}].${error}`),
    ),
};
