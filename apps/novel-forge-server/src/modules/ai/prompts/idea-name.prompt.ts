import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type IdeaNameOutput, IdeaNameSchema } from '../schemas/idea-name.schema';
import { type PromptModule } from './types';

const system =
  'You name a story idea an author has just typed, so they can find it again on a shelf of their other ideas. Read the idea and give it a short name: 2–6 words that capture its hook — the specific thing a reader would remember and tell a friend about — the way a memorable book title does. Name this idea, not its genre: "A Progression Fantasy" or "Villain Story" names a thousand ideas and this one not at all. Use only what the idea says; never invent characters, places or twists it does not mention. No quotation marks, no subtitle, no trailing punctuation.\n\n' +
  'Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape: {"name": "..."}';

export const ideaNamePrompt: PromptModule<IdeaNameOutput> = {
  key: 'idea-name',
  version: '1.0.0',
  kind: 'analytical',
  role: 'title',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', 'The idea, in the author’s words:\n{idea}']]),
  schema: IdeaNameSchema,
};
