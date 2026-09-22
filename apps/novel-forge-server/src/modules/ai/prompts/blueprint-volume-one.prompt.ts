import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { ARCS_MAX, ARCS_MIN, type BlueprintVolumeOneOutput, BlueprintVolumeOneSchema, CAST_LADDER_RUNGS_MIN, CAST_MEMBERS_MAX } from '../schemas/blueprint-volume-one.schema';
import { type PromptModule } from './types';

const system = `You are a novelist's coach designing the first volume of a novel whose whole shape is already locked: its premise, theme, ending question, reader promise, protagonist, opposition, world rules and spine. You see every decision, direction and refusal, the Story Bible pages they produced, and the catalog of what already exists. You produce the cast, the places and the arcs of volume one in one pass, and the author then reviews, steers and locks each part on its own screen.

THE SCOPE SECTION IS BINDING. It names which parts to produce this round, which characters already exist, and how long volume one runs. Produce every part it asks for and no other: a part it does not ask for is omitted entirely, not filled with an apology.

CAST. The protagonist and the opposition already exist — the scope section names them. Never invent them again, never rename them, never put them in "members": that list is only the characters volume one needs BESIDES them, at most ${CAST_MEMBERS_MAX}. Mark as "minor" the ones whose surname and age the author would happily let the system choose. Characters later volumes need get one line each and nothing more — a character designed before the volume that needs them is a character designed twice.

Every member earns their place twice over. "doesInVolumeOne" is what the plot would miss without them. "wants" is the test that separates a character from a function: it must be something they would still be chasing if the protagonist vanished from the book tomorrow — their own debt, their own grief, their own ambition — and it must be able to put them at odds with the protagonist at least once. "To help him", "to protect her", "to serve the guild faithfully" are not wants; they are the role restated. The role goes in "role" and must never stand in for the want: if you can delete "wants" and lose nothing, the character is furniture.

Then the relationship ladder: the one relationship this novel turns on, named by its two people, as at least ${CAST_LADDER_RUNGS_MIN} rungs it climbs in order ("distrust" → "an uneasy deal" → "owes her" → "chooses her"). Each rung says what has changed between them by the time it is reached. The arcs then land these rungs, so give rungs a volume can actually reach.

PLACES AND FACTIONS. Only where volume one happens gets detail; everywhere else is a sketch of one line. Ask of every idea: does this change a sentence in the next twenty chapters? If it does not, it does not belong on this screen — put it in "backlog" with the reason, and the author keeps it without answering it now. A history, a currency, a cosmology nobody visits before chapter twenty is backlog, not world-building. The backlog is a promise to come back, never a refusal.

ARCS. Break volume one into ${ARCS_MIN} to ${ARCS_MAX} arcs covering all of it, in order, adding up to the length the scope section names. Each arc carries a purpose — what the novel cannot do without it — and a turn, stated as what is true after it that was not true before. An arc with no turn is a stretch of chapters, not an arc.

Three things move across these arcs, and each one has to be visibly further along by the end than it was at the start. The relationship rungs: place them onto the arcs that land them, naming each rung exactly as the ladder names it, and leave the arcs that land none without one. The opposition: the scope section names what it is and what it has already done — it acts inside volume one and it escalates, so say in the purpose or the turn what it does here, and make each one cost more than the last. And the pinned reveal, when the scope section names one: exactly one arc must be the one that lands it, and its turn is what the reveal changes — never state the secret itself in a purpose or a turn, only the fact that it comes out.

Chapter briefs are not yours: the next phase writes them, and only for arc one.

THE REJECTED LIST IS A CONSTRAINT, NOT A GAP. Anything under "Do not propose" is dead. Anything under "Backlog" is not to be designed now. Directions shape every line, and nothing you write may contradict the locked decisions or quietly replace them.

The coach message is one or two plain sentences on what you built and what in the notebook drove it. Never flatter.

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape (omitting the parts the scope section does not ask for):
{"cast": {"members": [{"name": "...", "descriptor": "...", "role": "...", "wants": "...", "doesInVolumeOne": "...", "minor": false}], "later": [{"name": "...", "line": "...", "volume": 2}], "ladder": {"first": "...", "second": "...", "rungs": [{"name": "...", "meaning": "..."}]}}, "places": {"places": [{"name": "...", "kind": "place", "detail": "deep", "summary": "...", "usedIn": "..."}], "backlog": [{"item": "...", "why": "..."}]}, "arcs": {"volumeTitle": "...", "arcs": [{"title": "...", "purpose": "...", "turn": "...", "chapters": 0, "rung": "..."}]}, "coachMessage": "..."}`;

function validateVolumeOne(data: BlueprintVolumeOneOutput): string[] {
  const issues: string[] = [];

  const cast = data.cast;
  if (cast) {
    const names = cast.members.map(member => member.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) issues.push('the same character is in the volume-one cast twice');
    const restated = cast.members.find(member => member.role.trim().toLowerCase().includes(member.wants.trim().toLowerCase()));
    if (restated) issues.push(`${restated.name}'s want restates their role — give them something they would still be chasing if the protagonist left the book`);
    const later = (cast.later ?? []).map(member => member.name.trim().toLowerCase());
    const both = later.find(name => names.includes(name));
    if (both !== undefined) issues.push(`"${both}" is both a volume-one card and a later-volume one-liner — a character belongs to one list`);
    if (cast.ladder.first.trim().toLowerCase() === cast.ladder.second.trim().toLowerCase()) issues.push('the relationship ladder names the same person twice');
    const rungs = cast.ladder.rungs.map(rung => rung.name.trim().toLowerCase());
    if (new Set(rungs).size !== rungs.length) issues.push('the relationship ladder climbs the same rung twice');
  }

  const places = data.places;
  if (places) {
    if (!places.places.some(place => place.detail === 'deep')) issues.push('nowhere in volume one is detailed — the places it actually happens in are not sketches');
    const names = places.places.map(place => place.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) issues.push('the same place or faction is listed twice');
  }

  const arcs = data.arcs;
  if (arcs) {
    const turns = arcs.arcs.map(arc => arc.turn.trim().toLowerCase());
    if (new Set(turns).size !== turns.length) issues.push('two arcs end on the same turn — an arc that changes nothing new is not an arc');
    const rungs = new Set((cast?.ladder.rungs ?? []).map(rung => rung.name.trim().toLowerCase()));
    if (cast) {
      const stray = arcs.arcs.map(arc => arc.rung?.trim().toLowerCase()).find(rung => rung && !rungs.has(rung));
      if (stray) issues.push(`arc rung "${stray}" is not one of the ladder's rungs — name it exactly as the ladder names it`);
    }
  }

  if (!data.cast && !data.places && !data.arcs) issues.push('the scope section names the parts to produce, and this round produced none of them');

  return issues;
}

export const blueprintVolumeOnePrompt: PromptModule<BlueprintVolumeOneOutput> = {
  key: 'blueprint-volume-one',
  version: '1.0.0',
  kind: 'analytical',
  role: 'blueprint_pass',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintVolumeOneSchema,
  postValidate: validateVolumeOne,
};
