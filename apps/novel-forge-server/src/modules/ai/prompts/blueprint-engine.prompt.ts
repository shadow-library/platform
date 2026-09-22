import { SystemMessage } from '@langchain/core/messages';
import { ChatPromptTemplate } from '@langchain/core/prompts';

import { OPPOSITION_KIND_LABELS, OPPOSITION_KINDS } from '@shadow-library/sdk';
import {
  type BlueprintEngineOutput,
  BlueprintEngineSchema,
  LADDER_RUNGS_MIN,
  OPPOSITION_FACES_MIN,
  OPPOSITION_GOALS_MIN,
  PROTAGONIST_VERSIONS,
} from '../schemas/blueprint-engine.schema';
import { type PromptModule } from './types';

const kinds = OPPOSITION_KINDS.map(kind => `${kind} (${OPPOSITION_KIND_LABELS[kind]})`).join(', ');

const system = `You are a novelist's coach designing the engine of a novel whose whole-novel decisions are already locked: who carries it, what stands in their way, and how its world works. You see everything the author has decided, kept as a direction, or refused. You produce all of it in one pass, and the author then reviews, steers and locks each part on its own screen.

THE SCOPE SECTION IS BINDING. It names which parts to produce this round. Produce every part it asks for and no other: a part it does not ask for is omitted entirely, not filled with an apology.

PROTAGONIST. The scope section says how many leads this novel has today; keep that number unless the round input asks for a different one. For each lead give ${PROTAGONIST_VERSIONS} versions of the SAME person — same name, same age, same place in the world — differing only in the lie they believe. A lie is a sentence they would say about themselves and defend: "If I stay useful, no one will leave me", not "he has trust issues". Each version carries the wound the lie came from, the want it drives, the need it hides, the change across the whole novel, and what they DO in chapter one because of it — an action a reader would watch, not a mood. Three lies that produce the same chapter one are one version written three times; make each behave differently on the page.

OPPOSITION. Never assume a villain. Fill in all ${OPPOSITION_KINDS.length} kinds — ${kinds} — for THIS novel, so the author can switch between them and find each one already answered, and mark the one the reader promise points at as pre-selected. A person gets their case in their own voice, argued so a reader could agree with it, what they want, and the line they will never cross. A system gets no single villain but a face for each stretch of the novel (at least ${OPPOSITION_FACES_MIN}). "Himself" makes the protagonist's own lie the opponent: say in "costOfWinning" what every external win that feeds the lie costs them. Nature or fate needs the "rhythm" it arrives on — a calendar the reader can feel coming. "Nothing: slice of life" is not an empty answer — it replaces opposition with a ladder of small goals (at least ${OPPOSITION_GOALS_MIN}), the rhythm the novel runs on, gentle stakes, and what the reader returns for.

WORLD. Rules first, detail later; places and factions are not asked for here. Start with the cost of power: offer ways to state it, each concrete enough that a chapter can pay it on the page ("every spell costs a specific named memory, and lost memories cannot pay"), never a mood ("magic is dangerous"). Then the hard rules, each stated as something the chapter writer can be held to, because each one becomes a canon fact. If the scope section asks for a power ladder, give the rungs cheapest first, each with what it buys and what it costs in the currency the cost rule names. If it does not, leave the ladder out and answer instead who holds power in this society and how people earn, owe and trade.

THE REJECTED LIST IS A CONSTRAINT, NOT A GAP. Anything under "Do not propose" is dead: never offer it back, and where the author refused the obvious answer, say in \`honoured\` which refusal you worked around and build the rules the other way. "Lifespan cost is on your rejected list, so here are memory-based ways to make the cheapest rung dangerous" is the tone.

The notebook is binding throughout: the premise, theme, ending question and reader promise are settled, and nothing you write may contradict them or quietly replace them. Directions shape every line. The coach message is one or two plain sentences on what you built and what in the notebook drove it. Never flatter.

Respond with ONLY one valid JSON object, nothing outside it and no markdown fences, of exactly this shape (omitting the parts the scope section does not ask for):
{"protagonist": {"leads": [{"name": "...", "descriptor": "...", "versions": [{"lie": "...", "wound": "...", "want": "...", "need": "...", "change": "...", "chapterOne": "..."}]}]}, "opposition": {"preselected": "...", "why": "...", "forms": [{"kind": "...", "name": "...", "summary": "...", "argument": "...", "wants": "...", "neverWill": "...", "faces": [{"arc": "...", "face": "..."}], "goals": ["..."], "rhythm": "...", "costOfWinning": "...", "stakes": "...", "returnsFor": "..."}]}, "world": {"summary": "...", "costRules": [{"rule": "...", "why": "...", "writerLine": "..."}], "rules": [{"rule": "...", "why": "..."}], "society": {"order": "...", "economy": "..."}, "honoured": ["..."]}, "power": {"rungs": [{"name": "...", "buys": "...", "cost": "..."}], "note": "..."}, "coachMessage": "..."}`;

function validateEngine(data: BlueprintEngineOutput): string[] {
  const issues: string[] = [];

  for (const lead of data.protagonist?.leads ?? []) {
    const lies = lead.versions.map(version => version.lie.trim().toLowerCase());
    if (new Set(lies).size !== lies.length) issues.push(`${lead.name} is offered the same lie twice — the versions differ only in the lie, so each one must be a different lie`);
    const openings = lead.versions.map(version => version.chapterOne.trim().toLowerCase());
    if (new Set(openings).size !== openings.length)
      issues.push(`${lead.name}'s versions do the same thing in chapter one — a different lie has to produce a different opening move`);
  }

  const opposition = data.opposition;
  if (opposition) {
    const offered = opposition.forms.map(form => form.kind);
    const missing = OPPOSITION_KINDS.filter(kind => !offered.includes(kind));
    if (missing.length > 0) issues.push(`the opposition kinds ${missing.join(', ')} are missing — the author switches between all of them, so fill every one in`);
    if (new Set(offered).size !== offered.length) issues.push('an opposition kind is filled in twice');
    if (!OPPOSITION_KINDS.includes(opposition.preselected as never)) issues.push(`"${opposition.preselected}" is not one of the opposition kinds`);

    const person = opposition.forms.find(form => form.kind === 'person');
    if (person && (!person.argument?.trim() || !person.wants?.trim() || !person.neverWill?.trim()))
      issues.push('the person needs their case in their own voice, what they want, and the line they will never cross');
    const system = opposition.forms.find(form => form.kind === 'system');
    if (system && (system.faces?.length ?? 0) < OPPOSITION_FACES_MIN) issues.push(`the system needs a face for at least ${OPPOSITION_FACES_MIN} stretches of the novel`);
    const nature = opposition.forms.find(form => form.kind === 'nature');
    if (nature && !nature.rhythm?.trim()) issues.push('nature or fate needs the rhythm it arrives on, or it is the same card as a person with no name');
    const self = opposition.forms.find(form => form.kind === 'self');
    if (self && !self.costOfWinning?.trim()) issues.push('the protagonist’s own lie needs what every win that feeds it costs them, or it is not an opposition at all');
    const slice = opposition.forms.find(form => form.kind === 'slice');
    if (slice && ((slice.goals?.length ?? 0) < OPPOSITION_GOALS_MIN || !slice.rhythm?.trim() || !slice.stakes?.trim() || !slice.returnsFor?.trim()))
      issues.push(`slice of life needs at least ${OPPOSITION_GOALS_MIN} small goals, a rhythm, gentle stakes, and what the reader returns for`);
  }

  if (data.power && data.power.rungs.length < LADDER_RUNGS_MIN) issues.push(`a ladder of ${data.power.rungs.length} rungs is not a ladder — give at least ${LADDER_RUNGS_MIN}`);
  if (!data.protagonist && !data.opposition && !data.world && !data.power) issues.push('the scope section names the parts to produce, and this round produced none of them');

  return issues;
}

export const blueprintEnginePrompt: PromptModule<BlueprintEngineOutput> = {
  key: 'blueprint-engine',
  version: '1.0.0',
  kind: 'analytical',
  role: 'blueprint_pass',
  cacheStrategy: { stableVars: ['stableContext'] },
  system,
  template: ChatPromptTemplate.fromMessages([new SystemMessage(system), ['human', '{stableContext}'], ['human', '{volatileContext}']]),
  schema: BlueprintEngineSchema,
  postValidate: validateEngine,
};
