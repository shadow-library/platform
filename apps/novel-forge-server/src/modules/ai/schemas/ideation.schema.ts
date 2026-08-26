import { Field, Schema } from '@shadow-library/class-schema';

import { type Ideation } from '@server/database';

import { READINESS_DIMENSION_ORDER } from '../../ideation/question-router';

@Schema()
export class IdeationQuestionOut {
  @Field({ minLength: 1, description: 'the question id exactly as the round handed it over — never invent an id, never merge two questions into one' })
  id: string;

  @Field({ minLength: 1, description: "the question in the author's language, built from what this seed already says; one question, no preamble" })
  wording: string;

  @Field({ minLength: 1, description: 'the coaching line copied character for character from the round input — this text is reviewed prose, never rewritten or summarised' })
  coaching: string;

  @Field(() => [String], {
    minItems: 2,
    description: 'concrete answers the author can tap, each one a real decision made out of this seed and its taste anchors — never a category name, never "something else"',
  })
  options: string[];

  @Field({ minLength: 1, description: 'the commit-and-explain escape hatch: the answer you would pick, and the one-line reason it is the right one for this story' })
  youDecide: string;
}

@Schema()
export class IdeationLockOut {
  @Field({ minLength: 1, description: "the constraint key, taken from the question's emission contract when it names one ('setting', 'promise', 'refusal', 'foil', 'renewal')" })
  key: string;

  @Field(() => String, {
    enum: ['shape', 'scope', 'promise'],
    description: 'shape = how the story is built, scope = how much of it there is or where it happens, promise = a rule to the reader',
  })
  kind: Ideation.ConstraintKind;

  @Field({ minLength: 1, description: 'the decision as one falsifiable rule the plan can be checked against' })
  text: string;
}

@Schema()
export class IdeationTurnPayload {
  @Field(() => [IdeationQuestionOut], {
    description: 'one entry per question the round handed over, in the order it handed them over; an empty list only when the round asked nothing',
  })
  questions: IdeationQuestionOut[];

  @Field(() => [IdeationLockOut], { optional: true, description: 'decisions read out of what the author just said, for confirmation — omit when nothing new was decided' })
  locks?: IdeationLockOut[];
}

@Schema()
export class IdeationTurnSchema {
  @Field({ minLength: 1, description: 'what you say to the author this turn: what you heard, what it commits them to, and the questions in prose' })
  reply: string;

  @Field(() => IdeationTurnPayload)
  payload: IdeationTurnPayload;

  @Field(() => [Object], { optional: true, description: 'seed.update ops recording what the author settled this turn; omit when nothing was settled' })
  changeSet?: Record<string, unknown>[];
}

export type IdeationTurnOutput = IdeationTurnSchema;

@Schema()
export class IdeationConceptCard {
  @Field({ minLength: 1, description: 'a working title a reader would remember — not a description of the book' })
  title: string;

  @Field({ minLength: 1, description: 'one sentence: who, what pressure, what they stand to lose' })
  logline: string;

  @Field({ minLength: 1, description: 'what generates pressure chapter after chapter — the thing that keeps producing scenes once the premise is spent' })
  engine: string;

  @Field({ minLength: 1, description: 'the visible thing that climbs, so a reader can anticipate and argue about the next rung' })
  ladder: string;

  @Field({ minLength: 1, description: "the protagonist's stance toward the world — hunter, hunted, custodian, opportunist, believer" })
  posture: string;

  @Field({ minLength: 1, description: 'the line that would make a browsing reader open chapter one' })
  hookLine: string;
}

@Schema()
export class IdeationConceptsSchema {
  @Field(() => [IdeationConceptCard], { minItems: 4, maxItems: 4, description: 'exactly four concepts, each a different novel — not four dressings of one' })
  cards: IdeationConceptCard[];
}

export type IdeationConceptsOutput = IdeationConceptsSchema;

@Schema()
export class IdeationReadinessEntry {
  @Field(() => String, { enum: [...READINESS_DIMENSION_ORDER], description: 'the readiness dimension being judged' })
  dimension: string;

  @Field(() => String, {
    enum: ['strong', 'thin', 'empty'],
    description: 'strong = a planner could build on it, thin = present but not yet load-bearing, empty = nothing to build on',
  })
  verdict: Ideation.ReadinessVerdict;

  @Field({ minLength: 1, description: 'one sentence naming what is actually there, quoting the sheet rather than describing it in the abstract' })
  note: string;

  @Field({ optional: true, minLength: 1, description: 'the single takeable next step that would lift this dimension — required on every thin or empty verdict, omitted on strong' })
  fix?: string;
}

@Schema()
export class IdeationStressSchema {
  @Field(() => [IdeationReadinessEntry], {
    minItems: READINESS_DIMENSION_ORDER.length,
    maxItems: READINESS_DIMENSION_ORDER.length,
    description: `all ${READINESS_DIMENSION_ORDER.length} dimensions, in this exact order: ${READINESS_DIMENSION_ORDER.join(', ')}`,
  })
  readiness: IdeationReadinessEntry[];
}

export type IdeationStressOutput = IdeationStressSchema;
