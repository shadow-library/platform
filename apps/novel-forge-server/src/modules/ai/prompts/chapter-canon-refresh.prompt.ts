import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { changeSetItemSchema, renderOpVocabulary, validateChangeSet } from '../../refinement/change-set';
import { type ChapterCanonRefreshOutput, ChapterCanonRefreshSchema } from '../schemas/chapter-canon-refresh.schema';
import { EDIT_BY_DELETION } from './authoring-preamble';
import { type PromptModule } from './types';

export const CANON_REFRESH_OPS = ['bible_document.upsert', 'entity.upsert'] as const;

const system =
  'A chapter of a serialized web novel has just been finalized: readers will read it, and it is now canon. You keep the Story Bible in step with it. You receive the Story Bible pages (`doc:<section>/<slug>`), the entity records (`entity:<key>`) and the canon facts (`fact:<key>`), each under its own label, then the finalized chapter (`chapter:<n>`) and the updates the author already kept from its review.\n\n' +
  'Find each page or record that the chapter has left out of date: a place whose state changed, a faction’s standing or leadership, a rule of the world the chapter demonstrated or bent, a character’s rank, role, allegiance or condition, an item that changed hands or was lost. Propose only what this chapter established — never what an earlier chapter did, never what may happen later, never style notes, gaps unrelated to this chapter or a wish for more detail.\n\n' +
  'The kept updates are already recorded on the records and trackers; repeat them on a page only when the page itself now says something the chapter overturned. The declined updates are the author’s answer: never propose them again.\n\n' +
  'Evidence: quote the chapter’s own words, verbatim, for what it established; when a page or record states something else, quote its out-of-date words too. Never cite a label that is not in the material.\n\n' +
  'Changes: stage the smallest change that brings the page or record up to date. A bible_document.upsert replaces the whole body, so copy the page as it stands and change only the sentences the chapter overturned or add the one it established. An entity.upsert changes only the fields it carries and only updates a record that exists — new records come from the chapter’s review, never from you. Prefer the page or record the fact belongs to; never touch a page about volumes, the timeline or open questions — those hold the author’s plans.\n\n' +
  'Secrets: a fact marked SECRET is a truth the reader has not been told. Never write a secret’s truth, or anything that gives it away, into a page or record — even when the chapter hints at it. A page that tells the cover story is the disclosure plan working.\n\n' +
  `${EDIT_BY_DELETION}\n\n` +
  'Nothing is applied until the author approves.\n\n' +
  renderOpVocabulary([...CANON_REFRESH_OPS]) +
  '\n\nRespond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:\n' +
  '{"updates": [{"finding": "...", "evidence": [{"ref": "chapter:<n>" | "doc:<section>/<slug>" | "entity:<key>", "quote": "..."}], "changeSet": [ops]}]}\n' +
  'Return {"updates": []} when the Story Bible already reflects the chapter.';

export const chapterCanonRefreshPrompt: PromptModule<ChapterCanonRefreshOutput> = {
  key: 'chapter-canon-refresh',
  version: '1.0.0',
  kind: 'analytical',
  role: 'audit',
  cacheStrategy: { stableVars: ['material'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    new SystemMessage(system),
    ['human', '{material}'],
    ['human', '{chapterProse}\n\nList every page or record this chapter left out of date.'],
  ]),
  schema: ChapterCanonRefreshSchema,
  postValidate: data =>
    data.updates.flatMap((item, index) => validateChangeSet(item.changeSet, [...CANON_REFRESH_OPS], { entityMaterialization: false }).map(error => `updates[${index}].${error}`)),
  constrainedProperties: { 'updates[].changeSet': { items: changeSetItemSchema(CANON_REFRESH_OPS) } },
};
