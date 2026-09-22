import { Field, Integer, Schema } from '@shadow-library/class-schema';

export const SPINE_NAME_MAX = 80;
export const SPINE_LINE_MAX = 200;
export const SPINE_TEXT_MAX = 600;
export const SPINE_WRITER_LINE_MAX = 240;
export const SPINE_COACH_MAX = 400;

export const MOVEMENTS_MIN = 3;
export const MOVEMENTS_MAX = 8;
export const MOVEMENT_CHAPTERS_MIN = 5;
export const MOVEMENT_CHAPTERS_MAX = 300;

export const REVEALS_MIN = 2;
export const REVEALS_MAX = 8;
export const REVEAL_TERMS_MAX = 6;

@Schema()
export class BlueprintMovementOut {
  @Field({ minLength: 1, maxLength: SPINE_NAME_MAX, description: 'what this volume is called while it is a sketch, e.g. “Discovery”' })
  title: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX, description: 'what happens across it, in one line — a sketch, never a plan' })
  summary: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX, description: 'what changes in the protagonist here, as a word or two the next movement can move on from' })
  change: string;

  @Field(() => Integer, { minimum: MOVEMENT_CHAPTERS_MIN, maximum: MOVEMENT_CHAPTERS_MAX, description: 'how many chapters it runs for' })
  chapters: number;
}

@Schema()
export class BlueprintRevealOut {
  @Field(() => Integer, { minimum: 1, maximum: MOVEMENTS_MAX, description: 'which movement it comes out in, by its position in the list above' })
  movement: number;

  @Field({ minLength: 1, maxLength: SPINE_NAME_MAX, description: 'where inside that movement, in the author’s words, e.g. “end of arc one”' })
  when: string;

  @Field({ minLength: 1, maxLength: SPINE_LINE_MAX, description: 'the truth the reader learns there — a spoiler, which becomes a scheduled canon fact and never reaches a page' })
  truth: string;

  @Field({
    minLength: 1,
    maxLength: SPINE_LINE_MAX,
    description: 'what whoever writes the chapters before it must do about it WITHOUT stating it — the only part of a reveal the drafter is ever shown',
  })
  writerNote: string;

  @Field(() => [String], { optional: true, maxItems: REVEAL_TERMS_MAX, description: 'the give-away names and phrases no chapter before it may use' })
  terms?: string[];
}

@Schema()
export class BlueprintSpineSchema {
  @Field(() => [BlueprintMovementOut], { minItems: MOVEMENTS_MIN, maxItems: MOVEMENTS_MAX, description: 'one movement per volume, in order' })
  movements: BlueprintMovementOut[];

  @Field(() => [BlueprintRevealOut], {
    optional: true,
    maxItems: REVEALS_MAX,
    description: 'the big truths and where they come out, earliest first; omitted only when the scope section says this novel schedules none',
  })
  reveals?: BlueprintRevealOut[];

  @Field({ optional: true, maxLength: SPINE_LINE_MAX, description: 'one line on how the ending question is answered by the last movement' })
  note?: string;

  @Field({ minLength: 1, maxLength: SPINE_COACH_MAX, description: 'one or two plain sentences on the shape you built and what in the notebook drove it' })
  coachMessage: string;
}

export type BlueprintSpineOutput = BlueprintSpineSchema;
