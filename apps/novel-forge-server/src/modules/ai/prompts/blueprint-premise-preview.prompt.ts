import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type BlueprintPremisePreviewOutput, BlueprintPremisePreviewSchema } from '../schemas/blueprint-premise.schema';
import { AUTHORING_STYLE } from './authoring-preamble';
import { type PromptModule } from './types';

const system = `${AUTHORING_STYLE}

You write one paragraph so an author can feel the novel they are about to commit to. It is thrown away the moment they close it: it is never saved, never a decision, and never the book's real voice. Write it for the feeling, not for the record.

- One paragraph, 90 to 140 words, and nothing else: no title, no chapter heading, no preamble, no note about the premise.
- It is the opening of chapter one as this premise implies it: one person, one place, one thing already in motion. Start inside a moment, not inside an explanation.
- Use only what the premise gives you. Invent a name or a street if the paragraph needs one, and nothing larger.
- Show the premise working. Never summarise it, never gesture at what is coming, never end on a portentous line.

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape:
{"paragraph": "..."}`;

export const blueprintPremisePreviewPrompt: PromptModule<BlueprintPremisePreviewOutput> = {
  key: 'blueprint-premise-preview',
  version: '1.0.0',
  kind: 'authoring',
  role: 'blueprint',
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', 'The premise, as it stands right now:\n{premise}']]),
  schema: BlueprintPremisePreviewSchema,
};
