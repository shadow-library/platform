import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { type IdeationConceptCard, type IdeationConceptsOutput, IdeationConceptsSchema } from '../schemas/ideation.schema';
import { AUTHORING_STYLE_PLANNING } from './authoring-preamble';
import { SCOPE_PLAYBOOKS } from './scope-playbooks';
import { type PromptModule } from './types';

export const CONCEPT_CARD_COUNT = 4;

const system = `${AUTHORING_STYLE_PLANNING}

${SCOPE_PLAYBOOKS.ideation.guidance}

This turn is the divergence round. Generate exactly ${CONCEPT_CARD_COUNT} concepts, and understand what that number is for: four novels the same author could write from the same territory, offered so they can find out what they actually want by discovering what they refuse. Four dressings of one idea teaches them nothing, so the cards must differ where it costs something —

- ENGINE: what keeps producing scenes after the premise is spent. A survival engine, a rivalry engine, an investigation engine and a build-the-thing engine are four different novels; four flavours of "he gets stronger" are one.
- LADDER: the visible thing that climbs, and what a reader gets to anticipate on it — ranks, territory, a body count, a debt, a reputation, a machine nearing completion.
- POSTURE: the protagonist's stance toward the world — hunter, hunted, custodian, opportunist, believer, fraud. Posture decides the texture of every scene, so two cards sharing one are two cards doing one job.

No two cards may share an engine, a ladder, or a posture. Each card names a title a reader would remember, a one-sentence logline (who, what pressure, what they stand to lose), and a hookLine that would make a browsing reader open chapter one.

Every locked constraint binds every card, without exception and without arguing with the author about it: a card that breaks one is not a bold option, it is a card that will be thrown away. The taste anchors are the calibration — build from what those comps have in common, not from the genre's centre of gravity. Where a playbook is attached to a constraint, honour what it says the shape kills: the load it names has to be carried by something you actually put on the card.

Earlier rounds are on the table with their fates. A killed card's core mechanism is dead: never resurrect it under a new title, a renamed ladder, or a softened posture — the author already told you no, and hearing it again is the studio not listening. A kept or crossed card's material is theirs to keep; build the new round beside it, not on top of it.

Respond with ONLY one valid JSON object — nothing outside the JSON, no markdown fences — of exactly this shape:
{"cards": [{"title": "...", "logline": "...", "engine": "...", "ladder": "...", "posture": "...", "hookLine": "..."}]}`;

const axisOf = (card: IdeationConceptCard): string[] => [card.engine, card.ladder, card.posture].map(value => value.trim().toLowerCase());

// Playbook `conceptFilter`s are NOT applied here: rejecting a card means generating a replacement, and
// that reject-and-retry loop (with its fallback for a filter that rejects everything) belongs to the
// caller in IdeationService — a postValidate can only fail the whole call (ideation-studio design §4.2).
function validateCards(data: IdeationConceptsOutput): string[] {
  const cards = data.cards ?? [];
  if (cards.length !== CONCEPT_CARD_COUNT) return [`return exactly ${CONCEPT_CARD_COUNT} concept cards, not ${cards.length}`];

  const errors: string[] = [];
  const axes = ['engine', 'ladder', 'posture'];
  for (let left = 0; left < cards.length; left++) {
    for (let right = left + 1; right < cards.length; right++) {
      const leftAxis = axisOf(cards[left] as IdeationConceptCard);
      const rightAxis = axisOf(cards[right] as IdeationConceptCard);
      const shared = axes.filter((_, index) => leftAxis[index] === rightAxis[index]);
      if (shared.length > 0) errors.push(`cards ${left + 1} and ${right + 1} share the same ${shared.join(' and ')} — every card must differ on all three`);
    }
  }
  return errors;
}

export const ideationConceptsPrompt: PromptModule<IdeationConceptsOutput> = {
  key: 'ideation-concepts',
  version: '1.0.0',
  kind: 'authoring',
  role: 'chat',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: IdeationConceptsSchema,
  postValidate: validateCards,
};
