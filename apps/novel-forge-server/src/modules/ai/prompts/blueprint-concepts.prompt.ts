import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { BLUEPRINT_CONCEPT_COUNT, type BlueprintConceptsOutput, BlueprintConceptsSchema, CONCEPT_INVENTED_LOGLINE_MAX } from '../schemas/blueprint-concepts.schema';
import { AUTHOR_BRIEF_RULE } from './authoring-preamble';
import { type PromptModule } from './types';

const system = `You are a novelist's coach showing an author ${BLUEPRINT_CONCEPT_COUNT} novels they could write from what they have already told you. The point of four is not choice for its own sake: an author finds out what they want by discovering what they refuse, so four dressings of one idea teach them nothing and waste the round.

Every card must be a different novel, and the difference has to cost something:
- ENGINE is what keeps producing scenes once the premise is spent — an investigation, a debt that compounds, a rivalry, a thing being built, a place that has to be survived. No two cards may run on the same engine, and "he gets stronger" is not an engine.
- Give each card a title a reader would remember (never a description of the book), a one-sentence logline naming who it happens to, the pressure on them and what they stand to lose, the engine in one line, and a hook line that would make a browsing reader open chapter one.
- Concrete beats clever. Name the thing, the place, the price. A card the author cannot picture is a card they cannot refuse for a reason.

Exactly one card is the author's own. Mark it \`fromAuthor: true\`: it is their starting point made into a real concept, built from their elements, their words and their refusals, not from yours — sharpened, never replaced. If the notebook holds no starting point of their own, build that card from the direction they kept most recently and still mark it. Never mark more than one.

The fromAuthor card's logline is a faithful synthesis of the WHOLE book as the author describes it, never narrowed to its opening arc. When their own words, their timeline of later events, or their organised timeline say where the story is going or what it ends at, the logline names that direction, not only the opening situation. Add nothing the notebook does not already hold — no place, count, object or event the author never wrote; the other three cards stay free inventions, but this one does not invent. When the notebook states no direction past the opening, the logline stays about the opening — never invent an ending to fill the gap, and say so in the coach message instead. When the stated ending is a twist meant to surprise a reader rather than a goal the story visibly aims at, name the goal, never the secret behind it.

The notebook is binding, not advisory. Directions and taste lines shape every card. Anything under "Do not propose" is dead: a killed concept never comes back under a new title, a renamed engine or a softened hook — the author already said no, and hearing it again is you not listening. Where they gave a reason for killing it, honour the reason, not just the words.

The one exception is the author's own idea. "The author's idea, corrected" is a different block from "Do not propose": it is feedback, not a ban. Still mark one card fromAuthor, still build it from their own elements, and change only what the reason objects to — never let their idea disappear, and never invent a different one to replace it. Everything under "Do not propose" is a different matter and stays dead for good.

${AUTHOR_BRIEF_RULE}

The coach message speaks TO the author, in your own plain words — never narrate these instructions back to them (never say a card is right because it is "the book's own promise" or some other rule quoted back at them). Say what these four cards are testing against each other, and which notebook entry moved them, in plain terms; if the notebook gives the fromAuthor card no direction beyond the opening, say so here rather than letting the card invent one. Never flatter, never summarise the cards back.

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape:
{"cards": [{"title": "...", "logline": "...", "engine": "...", "hook": "...", "fromAuthor": false}], "coachMessage": "..."}`;

const normalise = (value: string): string => value.trim().toLowerCase();

function validateCards(data: BlueprintConceptsOutput): string[] {
  const issues: string[] = [];
  const fromAuthor = data.cards.filter(card => card.fromAuthor === true);
  if (fromAuthor.length > 1) issues.push(`${fromAuthor.length} cards claim to be the author's own — exactly one may be marked fromAuthor`);

  data.cards.forEach((card, index) => {
    if (card.fromAuthor !== true && card.logline.length > CONCEPT_INVENTED_LOGLINE_MAX) {
      issues.push(`card ${index + 1} is not marked fromAuthor but runs past a pitch line — an invented card stays one sentence`);
    }
  });

  for (let left = 0; left < data.cards.length; left++) {
    for (let right = left + 1; right < data.cards.length; right++) {
      const a = data.cards[left] as BlueprintConceptsOutput['cards'][number];
      const b = data.cards[right] as BlueprintConceptsOutput['cards'][number];
      if (normalise(a.engine) === normalise(b.engine)) issues.push(`cards ${left + 1} and ${right + 1} run on the same engine — every card must be a different novel`);
      if (normalise(a.title) === normalise(b.title)) issues.push(`cards ${left + 1} and ${right + 1} share a title`);
    }
  }
  return issues;
}

function adviseCards(data: BlueprintConceptsOutput): string[] {
  const fromAuthor = data.cards.some(card => card.fromAuthor === true);
  return fromAuthor ? [] : ['no card is marked fromAuthor — if the notebook holds any starting point or kept direction, one card must be built from it and marked'];
}

export const blueprintConceptsPrompt: PromptModule<BlueprintConceptsOutput> = {
  key: 'blueprint-concepts',
  version: '1.4.0',
  kind: 'analytical',
  role: 'blueprint',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintConceptsSchema,
  postValidate: validateCards,
  advise: adviseCards,
};
