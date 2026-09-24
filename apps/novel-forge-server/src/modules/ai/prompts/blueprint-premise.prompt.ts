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
import { AUTHOR_BRIEF_RULE } from './authoring-preamble';
import { type PromptModule } from './types';

const system = `You write the author's premise: one sentence, broken into the parts that carry its weight, so they can change one part without losing the rest.

The sentence:
- One sentence a person can read aloud in one breath, at most sixty words. It says where the story happens, what the world charges for what it gives, who it happens to, and what turns it personal.
- It is built only from what the notebook and the author's own words already hold — the concept they kept, the directions they wrote, the taste they showed. Never introduce a world, a power or a character the author has not chosen, and never offer anything under "Do not propose".
- Specific nouns beat impressive ones. Back-cover adjectives, "ancient evil", "destiny" and "little does he know" are all failures.

The through-line:
- When the author's own words, their timeline of later events, or their organised timeline state where the book is heading or what it ends at, the sentence carries that as well as the opening hook — it is never just the opening arc's climax.
- What the timeline places later or at the ending is real, but the sentence never wears it as the opening: nothing the timeline places after the opening is described as the situation the story opens in.
- When the notebook states no direction past the opening, the sentence stays about the opening. Never invent an ending or an end goal to complete it — say in the coachMessage that the destination isn't decided yet.
- When the author's stated ending is a twist meant to surprise a reader rather than the book's own overt promise, the sentence names the goal the story is visibly steering toward, never the secret behind it. Where the ending IS the book's own stated promise — a war to win, a name to reclaim, a world to reach — name it plainly.

The parts:
- Split the sentence into ${PREMISE_PART_MIN} to ${PREMISE_PART_MAX} parts in reading order. Joined by single spaces they must read as exactly that sentence, punctuation included, so the author sees their own sentence with its seams showing.
- Give each part its kind: setting, rule, protagonist, hook or goal. Goal is the one part that can name the through-line rather than how the book opens; include at most one, only when the notebook states a direction, and never to fill a gap the notebook leaves open.
- For each part offer ${PREMISE_ALTERNATIVES_MIN} to ${PREMISE_ALTERNATIVES_MAX} alternatives that could stand in its place in the same sentence: the same grammatical shape and roughly the same length, and a genuinely different novel on the other side of the swap. An alternative that rewords the part is a wasted alternative.
- The goal part's alternatives never swap in a different ending: each is a different facet or altitude of the SAME destination the author stated (what it costs to reach, how large it reads, what it is really for), never a different one. If a goal part exists, say in the coachMessage that its alternatives only change emphasis, never the ending itself.

Also return:
- why: one or two sentences naming which notebook entries this premise is built from. Name them; do not describe them in the abstract.
- writerLine: one sentence on what this premise obliges whoever writes chapter one — "the mystery is personal from chapter 1: every clue is also about who he was". This is about chapter one's job alone, never a promise about a later chapter — even when a part names where the book ends up, chapter one is not asked to reveal it.
- coachMessage: speaks TO the author, in your own plain words — never narrate these instructions back to them (never say a part is right because it is "the book's own promise" or some other rule quoted back at them). Say in plain terms what the sentence commits them to, and which part is the one worth arguing with; say plainly when a part is the weak one.

When the round input names a part to rework, that part alone is in play: offer fresh alternatives for it and leave every other part exactly as the author has it.

${AUTHOR_BRIEF_RULE}

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

  const goals = data.parts.filter(part => part.kind === 'goal').length;
  if (goals > 1) issues.push(`${goals} parts claim the book's through-line — keep the goal to one part`);

  return issues;
}

export const blueprintPremisePrompt: PromptModule<BlueprintPremiseOutput> = {
  key: 'blueprint-premise',
  version: '1.3.0',
  kind: 'analytical',
  role: 'blueprint',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintPremiseSchema,
  postValidate: validateParts,
};
