import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import {
  type BlueprintPremiseOutput,
  BlueprintPremiseSchema,
  PREMISE_ALTERNATIVES_MAX,
  PREMISE_ALTERNATIVES_MIN,
  PREMISE_PART_MAX,
  PREMISE_PART_MIN,
} from '../schemas/blueprint-premise.schema';
import { type PromptModule } from './types';

const system = `You write the author's premise: one sentence, broken into the parts that carry its weight, so they can change one part without losing the rest.

The sentence:
- One sentence a person can read aloud in one breath, at most sixty words. It says where the story happens, what the world charges for what it gives, who it happens to, and what turns it personal.
- It is built only from what the notebook already holds — the concept they kept, the directions they wrote, the taste they showed. Never introduce a world, a power or a character the author has not chosen, and never offer anything under "Do not propose".
- Specific nouns beat impressive ones. Back-cover adjectives, "ancient evil", "destiny" and "little does he know" are all failures.

The parts:
- Split the sentence into ${PREMISE_PART_MIN} to ${PREMISE_PART_MAX} parts in reading order. Joined by single spaces they must read as exactly that sentence, punctuation included, so the author sees their own sentence with its seams showing.
- Give each part its kind: setting, rule, protagonist or hook.
- For each part offer ${PREMISE_ALTERNATIVES_MIN} to ${PREMISE_ALTERNATIVES_MAX} alternatives that could stand in its place in the same sentence: the same grammatical shape and roughly the same length, and a genuinely different novel on the other side of the swap. An alternative that rewords the part is a wasted alternative.

Also return:
- why: one or two sentences naming which notebook entries this premise is built from. Name them; do not describe them in the abstract.
- writerLine: one sentence on what this premise obliges whoever writes chapter one — "the mystery is personal from chapter 1: every clue is also about who he was".
- coachMessage: one or two plain sentences on what the sentence commits them to, and which part is the one worth arguing with. Say plainly when a part is the weak one.

When the round input names a part to rework, that part alone is in play: offer fresh alternatives for it and leave every other part exactly as the author has it.

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape:
{"parts": [{"text": "...", "kind": "setting", "alternatives": ["...", "..."]}], "why": "...", "writerLine": "...", "coachMessage": "..."}`;

const normalise = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

function validateParts(data: BlueprintPremiseOutput): string[] {
  const issues: string[] = [];
  data.parts.forEach((part, index) => {
    const own = normalise(part.text);
    const seen = new Set<string>();
    for (const alternative of part.alternatives) {
      const key = normalise(alternative);
      if (key === own) issues.push(`part ${index + 1} offers its own text as an alternative`);
      if (seen.has(key)) issues.push(`part ${index + 1} offers the same alternative twice`);
      seen.add(key);
    }
  });
  return issues;
}

export const blueprintPremisePrompt: PromptModule<BlueprintPremiseOutput> = {
  key: 'blueprint-premise',
  version: '1.0.0',
  kind: 'analytical',
  role: 'blueprint',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintPremiseSchema,
  postValidate: validateParts,
};
