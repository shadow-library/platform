import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type PassageRewriteOutput, PassageRewriteSchema } from '../schemas/passage-rewrite.schema';
import { AUTHORING_STYLE_REPAIR, EDIT_BY_DELETION } from './authoring-preamble';
import { type PromptModule } from './types';

export const PASSAGE_START = '[[PASSAGE]]';
export const PASSAGE_END = '[[/PASSAGE]]';

const system = `${AUTHORING_STYLE_REPAIR}\n\n${EDIT_BY_DELETION}\n\nYou are rewriting one passage of a novel chapter at the author's request. You receive the established canon context, the chapter brief, the whole chapter with the passage marked between ${PASSAGE_START} and ${PASSAGE_END}, the passage itself, and the author's request. Rewrite only that passage so it answers the request. It must still join the text before and after it: keep the tense, the point of view, who is present and what has already happened, and do not repeat or anticipate the surrounding text. Keep roughly its length unless the request asks otherwise. Return only the rewritten passage.`;

export const passageRewritePrompt: PromptModule<PassageRewriteOutput> = {
  key: 'passage-rewrite',
  version: '1.1.0',
  kind: 'authoring',
  role: 'revision',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\nOriginal brief:\n{chapterBrief}\n\nChapter:\n{draftBody}\n\nPassage to rewrite:\n{passage}\n\nThe author asks:\n{feedback}'],
  ]),
  schema: PassageRewriteSchema,
};
