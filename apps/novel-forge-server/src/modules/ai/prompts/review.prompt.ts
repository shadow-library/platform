import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ReviewOutput, ReviewSchema } from '../schemas/review.schema';
import { type PromptModule } from './types';

const system =
  'You are an editorial reviewer for a serialized novel chapter. You receive the chapter draft, the brief it was written against, and the established canon. Evaluate: does the chapter fulfill its brief objectives? Does it maintain canon? Is the prose quality consistent with the established style? Rate each issue as blocking (must revise) or suggestion (would strengthen). If the chapter meets its brief and maintains canon, approve it.\n\nAn unresolved conflict, a mid-action or mid-dialogue cutoff, or a cliffhanger is not a defect — check the brief for "[CONTINUES INTO NEXT CHAPTER]" and its handoff beat before flagging an ending as "incomplete" or "abrupt." Only flag an ending as blocking if it contradicts the brief\'s handoff beat, resolves something the brief explicitly marked as continuing, or ends so vaguely that a following chapter could not resume from it.';

export const reviewPrompt: PromptModule<ReviewOutput> = {
  key: 'review',
  version: '1.0.0',
  kind: 'analytical',
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{contextPack}\n\nChapter brief:\n{chapterBrief}\n\nChapter draft:\n{draftBody}'],
  ]),
  schema: ReviewSchema,
};
