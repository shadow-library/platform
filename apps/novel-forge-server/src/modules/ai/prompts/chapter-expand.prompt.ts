import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type ChapterExpandOutput, ChapterExpandSchema } from '../schemas/chapter-expand.schema';
import { type PromptModule } from './types';

const system = `You are expanding a chapter draft that came in under its length target. You receive the context pack (the author's writing instructions plus established canon), the chapter brief, its ending contract, and the current draft with its word count, plus any guidance the draft was written under. Return the complete chapter, lengthened to the requested size by deepening what is already there: dramatize moments the draft summarizes as on-page scene, let conversations run their full course, give the POV character's perceptions, reactions, and decisions room, and stage the physical movement between beats. Follow the author's writing instructions for how the prose reads, and keep the draft's point of view and tense.

Hard constraints:
- Keep every event, its order, and the outcome of each scene exactly as drafted. Add no new plot events, characters, reveals, or resolutions, and resolve nothing the draft leaves open.
- Keep the opening beat and the final beat. The chapter ends on the same moment, line, or decision as the draft and never continues past it — when the brief marks "[CONTINUES INTO NEXT CHAPTER]" or an ending contract is present, the cut stays exactly where it is.
- Stay inside the context pack's canon and knowledge boundaries ("## KNOWN FACTS (POV CAST)", "## REVEALED THIS CHAPTER", "## BEHAVIORAL CONSTRAINTS"): expansion never lets a character know more than the draft allowed.
- Canon always wins over dramatic convenience.
- Keep the draft's strongest lines; rewrite a sentence only where the added material needs a seam.
- No padding: no recaps, repeated information, re-explained emotions, inventory description, or stock reactions. Every added paragraph must show something the reader did not already have.`;

export const chapterExpandPrompt: PromptModule<ChapterExpandOutput> = {
  key: 'chapter-expand',
  version: '1.1.0',
  kind: 'authoring',
  role: 'generation',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([
    ['system', system],
    ['human', '{stableContext}'],
    [
      'human',
      '{volatileContext}\n\nChapter brief:\n{chapterBrief}\n\n## ENDING CONTRACT\n{endingContract}\n\nCurrent draft ({draftWords} words):\n{draftBody}\n\nAdditional guidance: {guidance}\n\nExpand this draft to at least {minWords} words — aim for about {aimWords}, roughly {missingWords} more than it has now — and return the complete chapter.',
    ],
  ]),
  schema: ChapterExpandSchema,
};
