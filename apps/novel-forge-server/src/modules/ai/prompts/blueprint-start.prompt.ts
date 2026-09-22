import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BlueprintStartOutput, BlueprintStartSchema, START_CHIP_MAX } from '../schemas/blueprint-start.schema';
import { type PromptModule } from './types';

const system = `You are the first reader of a novel that does not exist yet. The author has told you where they are starting from: a book they love, a character, a world, a single scene, a feeling, or nothing at all. Read it back to them as short chips so a misunderstanding shows at once.

- One chip per distinct thing they said, at most ${START_CHIP_MAX}. Two to eight words each, in their terms where you can.
- Mark each chip: "element" for something in the story, "want" for what they want a reader to feel or get, "not" for something they ruled out.
- Read, never invent. A chip the author cannot point to in their own words is a mistake, however good the idea. When they gave you nothing, return no chips and say so plainly.
- A book they love is a taste signal: name what they seem to love about it, never its plot, names or characters.
- The decision ledger and the author's earlier steers on this step are binding. Never offer anything the ledger lists under "Do not propose".

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape:
{"understood": [{"label": "...", "kind": "element"}], "coachMessage": "..."}`;

export const blueprintStartPrompt: PromptModule<BlueprintStartOutput> = {
  key: 'blueprint-start',
  version: '1.0.0',
  kind: 'analytical',
  role: 'blueprint',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintStartSchema,
};
