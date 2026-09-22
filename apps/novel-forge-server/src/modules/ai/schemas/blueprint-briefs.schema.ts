import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { EndingContractSchema } from './ending-contract.schema';
import { KnowledgeContractSchema } from './knowledge-contract.schema';
import { READER_VALUE_CHANGES } from './outline.schema';

export const BRIEF_NAME_MAX = 80;
export const BRIEF_LINE_MAX = 240;
export const BRIEF_BEAT_MAX = 200;
export const BRIEF_BEATS_MIN = 2;
export const BRIEF_BEATS_MAX = 8;
export const BRIEF_SCENES_MIN = 2;
export const BRIEF_SCENES_MAX = 6;
export const BRIEFS_MAX = 16;
export const BRIEF_CITES_MAX = 10;
export const BRIEF_COACH_MAX = 400;
export const BRIEF_WRITER_LINE_MAX = 240;
export const BRIEF_WHY_MAX = 400;

@Schema()
export class BlueprintBriefSceneOut {
  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX, description: 'what the POV character wants in this scene' })
  goal: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX, description: 'who or what stands in the way — a scene has no length without resistance' })
  obstacle: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX, description: 'how the situation has changed when the scene ends' })
  turn: string;

  @Field(() => [String], { minItems: BRIEF_BEATS_MIN, maxItems: BRIEF_BEATS_MAX, description: 'the on-page beats of the scene, in order' })
  beats: string[];

  @Field(() => Integer, { minimum: 1, description: 'the share of the chapter length this scene fills when dramatised' })
  estimatedWords: number;
}

@Schema()
export class BlueprintBriefOut {
  @Field(() => Integer, { minimum: 1, description: 'the chapter number, inside the arc’s own range' })
  chapter: number;

  @Field({ minLength: 1, maxLength: BRIEF_NAME_MAX })
  title: string;

  @Field({ minLength: 1, maxLength: BRIEF_NAME_MAX, description: 'entity key of the POV character, exactly as the catalog names it' })
  pov: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX, description: 'one sentence: why this chapter exists, not a restatement of what happens in it' })
  purpose: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX, description: 'what the chapter must accomplish' })
  objective: string;

  @Field(() => [BlueprintBriefSceneOut], { minItems: BRIEF_SCENES_MIN, maxItems: BRIEF_SCENES_MAX })
  scenes: BlueprintBriefSceneOut[];

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX, description: 'the beat the chapter ends on' })
  endsOn: string;

  @Field({ minLength: 1, maxLength: BRIEF_LINE_MAX, description: 'what this chapter must leave open for a later one' })
  mustNotResolve: string;

  @Field(() => [String], {
    maxItems: BRIEF_CITES_MAX,
    description: 'refs this chapter is written from, chosen from the catalog ("doc:world/setting-overview", "entity:kaen", "fact:cost_of_power"), most important first',
  })
  cites: string[];

  @Field(() => [String], { minItems: 1, description: `at least one concrete change this chapter delivers, each drawn from: ${READER_VALUE_CHANGES.join(', ')}` })
  readerValue: string[];

  @Field(() => EndingContractSchema)
  endingContract: EndingContractSchema;

  @Field(() => KnowledgeContractSchema, { optional: true, description: 'omit unless this chapter reveals a scheduled secret on the page; `pov` repeats the POV entity key' })
  knowledgeContract?: KnowledgeContractSchema;

  @Field({ optional: true, description: 'this chapter ends without resolving its central tension, and the next one picks up in that beat' })
  continuesIntoNextChapter?: boolean;

  @Field({ optional: true, description: 'this chapter opens in the exact beat the previous one handed off' })
  startsFromPreviousChapter?: boolean;

  @Field({ optional: true, maxLength: BRIEF_LINE_MAX, description: 'the moment continuation picks up — required when either chaining flag is set' })
  handoffBeat?: string;
}

@Schema()
export class BlueprintBriefsSchema {
  @Field({ minLength: 1, maxLength: BRIEF_NAME_MAX, description: 'the arc these briefs cover, as the arc plan names it' })
  arcTitle: string;

  @Field(() => [BlueprintBriefOut], { minItems: 1, maxItems: BRIEFS_MAX, description: 'every chapter of arc one, in order' })
  briefs: BlueprintBriefOut[];

  @Field({ minLength: 1, maxLength: BRIEF_COACH_MAX })
  coachMessage: string;
}

export type BlueprintBriefsOutput = BlueprintBriefsSchema;
