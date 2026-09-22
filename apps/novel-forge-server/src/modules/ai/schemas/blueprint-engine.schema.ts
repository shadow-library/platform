import { Field, Schema } from '@shadow-library/class-schema';

import { OPPOSITION_KINDS } from '@shadow-library/sdk';

export const ENGINE_NAME_MAX = 80;
export const ENGINE_LINE_MAX = 200;
export const ENGINE_TEXT_MAX = 600;
export const ENGINE_WRITER_LINE_MAX = 240;
export const ENGINE_COACH_MAX = 400;

export const PROTAGONIST_LEADS_MIN = 1;
export const PROTAGONIST_LEADS_MAX = 2;
export const PROTAGONIST_VERSIONS = 3;

export const OPPOSITION_FACES_MIN = 2;
export const OPPOSITION_FACES_MAX = 4;
export const OPPOSITION_GOALS_MIN = 2;
export const OPPOSITION_GOALS_MAX = 5;

export const COST_RULES_MIN = 2;
export const COST_RULES_MAX = 3;
export const WORLD_RULES_MIN = 3;
export const WORLD_RULES_MAX = 6;
export const WORLD_HONOURED_MAX = 4;

export const LADDER_RUNGS_MIN = 3;
export const LADDER_RUNGS_MAX = 7;

@Schema()
export class BlueprintProtagonistVersionOut {
  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'the lie this version believes, in their own voice and in quotation marks' })
  lie: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'the wound the lie came from' })
  wound: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'what they chase because of the lie' })
  want: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'what they actually need, which the lie hides from them' })
  need: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'the change across the whole novel, as “from X to Y”' })
  change: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'what they DO in chapter one because of this lie — an action on the page, not a mood' })
  chapterOne: string;
}

@Schema()
export class BlueprintProtagonistLeadOut {
  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'age and place in the world in a few words, e.g. “17, tithe apprentice”' })
  descriptor: string;

  @Field(() => [BlueprintProtagonistVersionOut], {
    minItems: PROTAGONIST_VERSIONS,
    maxItems: PROTAGONIST_VERSIONS,
    description: 'the same person three times over, differing only in the lie they believe and what it makes them do',
  })
  versions: BlueprintProtagonistVersionOut[];
}

@Schema()
export class BlueprintProtagonistOut {
  @Field(() => [BlueprintProtagonistLeadOut], {
    minItems: PROTAGONIST_LEADS_MIN,
    maxItems: PROTAGONIST_LEADS_MAX,
    description: 'one lead unless the author asked for two',
  })
  leads: BlueprintProtagonistLeadOut[];
}

@Schema()
export class BlueprintOppositionFaceOut {
  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX, description: 'which stretch of the novel wears this face, e.g. “arc one”' })
  arc: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'the person or office the system speaks through there' })
  face: string;
}

@Schema()
export class BlueprintOppositionFormOut {
  @Field(() => String, { enum: [...OPPOSITION_KINDS] })
  kind: string;

  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX, description: 'what the author would call this opposition; for “slice” the name of the life the novel follows' })
  name: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'the opposition in one line' })
  summary: string;

  @Field({ optional: true, maxLength: ENGINE_TEXT_MAX, description: 'person only: their case in their own voice, as they would argue it to the protagonist' })
  argument?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX, description: 'person and system: what it wants, stated so a reader could agree with it' })
  wants?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX, description: 'person only: the line they will never cross' })
  neverWill?: string;

  @Field(() => [BlueprintOppositionFaceOut], { optional: true, maxItems: OPPOSITION_FACES_MAX, description: 'system only: the face it wears in each stretch of the novel' })
  faces?: BlueprintOppositionFaceOut[];

  @Field(() => [String], { optional: true, maxItems: OPPOSITION_GOALS_MAX, description: 'slice only: the small-goals ladder, rung by rung, each one a season of wanting' })
  goals?: string[];

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX, description: 'slice and nature: the rhythm it arrives on — seasons, market days, the tide' })
  rhythm?: string;

  @Field({
    optional: true,
    maxLength: ENGINE_LINE_MAX,
    description: 'self only: what every external win that feeds the lie costs them — the price that makes winning the wrong way hurt',
  })
  costOfWinning?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX, description: 'slice only: the gentle stakes — a friendship strained, a recipe lost, a regular who stops coming' })
  stakes?: string;

  @Field({ optional: true, maxLength: ENGINE_LINE_MAX, description: 'slice only: what the reader comes back for' })
  returnsFor?: string;
}

@Schema()
export class BlueprintOppositionOut {
  @Field(() => String, { enum: [...OPPOSITION_KINDS], description: 'the kind the reader promise points at; the author may take any of them' })
  preselected: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'what in the locked decisions pre-selects that kind' })
  why: string;

  @Field(() => [BlueprintOppositionFormOut], {
    minItems: OPPOSITION_KINDS.length,
    maxItems: OPPOSITION_KINDS.length,
    description: 'every kind, once, filled in for THIS novel — the author switches between them and each must already be an answer',
  })
  forms: BlueprintOppositionFormOut[];
}

@Schema()
export class BlueprintCostRuleOut {
  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'what power costs, concretely enough that a chapter can pay it on the page' })
  rule: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'what this cost does to the story that another cost would not' })
  why: string;

  @Field({ minLength: 1, maxLength: ENGINE_WRITER_LINE_MAX, description: 'what it means for whoever writes chapter one' })
  writerLine: string;
}

@Schema()
export class BlueprintWorldRuleOut {
  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'a hard rule, stated as something the chapter writer can be held to' })
  rule: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'what the rule buys the story' })
  why: string;
}

@Schema()
export class BlueprintSocietyOut {
  @Field({ minLength: 1, maxLength: ENGINE_TEXT_MAX, description: 'who holds power here and how ordinary life is ordered' })
  order: string;

  @Field({ minLength: 1, maxLength: ENGINE_TEXT_MAX, description: 'how people earn, owe and trade' })
  economy: string;
}

@Schema()
export class BlueprintWorldOut {
  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'how this world works, in one line' })
  summary: string;

  @Field(() => [BlueprintCostRuleOut], {
    minItems: COST_RULES_MIN,
    maxItems: COST_RULES_MAX,
    description: 'ways the cost of power could be stated; the author picks one or writes their own',
  })
  costRules: BlueprintCostRuleOut[];

  @Field(() => [BlueprintWorldRuleOut], { minItems: WORLD_RULES_MIN, maxItems: WORLD_RULES_MAX })
  rules: BlueprintWorldRuleOut[];

  @Field(() => BlueprintSocietyOut, { optional: true, description: 'asked for instead of a power ladder when progression does not drive this novel' })
  society?: BlueprintSocietyOut;

  @Field(() => [String], {
    optional: true,
    maxItems: WORLD_HONOURED_MAX,
    description: 'ideas from the “Do not propose” list these rules work around, quoted as the author wrote them',
  })
  honoured?: string[];
}

@Schema()
export class BlueprintRungOut {
  @Field({ minLength: 1, maxLength: ENGINE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'what this rung buys that the one below does not' })
  buys: string;

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'what it costs, in the currency the cost rule names' })
  cost: string;
}

@Schema()
export class BlueprintPowerOut {
  @Field(() => [BlueprintRungOut], { minItems: LADDER_RUNGS_MIN, maxItems: LADDER_RUNGS_MAX, description: 'cheapest rung first, dearest last' })
  rungs: BlueprintRungOut[];

  @Field({ minLength: 1, maxLength: ENGINE_LINE_MAX, description: 'where the protagonist stands on the ladder when the novel opens' })
  note: string;
}

@Schema()
export class BlueprintEngineSchema {
  @Field(() => BlueprintProtagonistOut, { optional: true, description: 'omitted when the scope section does not ask for it' })
  protagonist?: BlueprintProtagonistOut;

  @Field(() => BlueprintOppositionOut, { optional: true, description: 'omitted when the scope section does not ask for it' })
  opposition?: BlueprintOppositionOut;

  @Field(() => BlueprintWorldOut, { optional: true, description: 'omitted when the scope section does not ask for it' })
  world?: BlueprintWorldOut;

  @Field(() => BlueprintPowerOut, { optional: true, description: 'omitted when the scope section does not ask for it' })
  power?: BlueprintPowerOut;

  @Field({ minLength: 1, maxLength: ENGINE_COACH_MAX, description: 'one or two plain sentences on what you built and what in the notebook drove it' })
  coachMessage: string;
}

export type BlueprintEngineOutput = BlueprintEngineSchema;
