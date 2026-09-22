import { Field, Integer, Schema } from '@shadow-library/class-schema';

export const VOLUME_ONE_NAME_MAX = 80;
export const VOLUME_ONE_LINE_MAX = 200;
export const VOLUME_ONE_WRITER_LINE_MAX = 240;
export const VOLUME_ONE_COACH_MAX = 400;

export const CAST_MEMBERS_MIN = 2;
export const CAST_MEMBERS_MAX = 10;
export const LATER_CAST_MAX = 8;
export const CAST_LADDER_RUNGS_MIN = 3;
export const CAST_LADDER_RUNGS_MAX = 6;

export const PLACES_MIN = 3;
export const PLACES_MAX = 12;
export const BACKLOG_MAX = 8;

export const ARCS_MIN = 3;
export const ARCS_MAX = 8;
export const ARC_CHAPTERS_MIN = 2;
export const ARC_CHAPTERS_MAX = 60;

export const PLACE_KINDS = ['place', 'faction'] as const;
export const PLACE_DEPTHS = ['deep', 'sketch'] as const;

export type PlaceKind = (typeof PLACE_KINDS)[number];
export type PlaceDepth = (typeof PLACE_DEPTHS)[number];

@Schema()
export class BlueprintCastMemberOut {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'who they are to the protagonist, in one line' })
  descriptor: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX, description: 'what they are to the story, e.g. “mentor”, “rival”, “ally”' })
  role: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'what they want of their own, which is not the protagonist’s want' })
  wants: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'what they do in volume one that the plot would miss without them' })
  doesInVolumeOne: string;

  @Field({ optional: true, description: 'true for a minor player whose surname and age the author may hand to the system' })
  minor?: boolean;
}

@Schema()
export class BlueprintLaterCastOut {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'the one line that is all this character gets until their volume is reached' })
  line: string;

  @Field(() => Integer, { minimum: 2, maximum: 20, description: 'the volume they first matter in' })
  volume: number;
}

@Schema()
export class BlueprintLadderRungOut {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX, description: 'the rung, in a word or two, e.g. “distrust”, “uneasy deal”' })
  name: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'what has changed between them by the time this rung is reached' })
  meaning: string;
}

@Schema()
export class BlueprintLadderOut {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX, description: 'one half of the key pair — usually the protagonist' })
  first: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX, description: 'the other half of the key pair' })
  second: string;

  @Field(() => [BlueprintLadderRungOut], { minItems: CAST_LADDER_RUNGS_MIN, maxItems: CAST_LADDER_RUNGS_MAX, description: 'the rungs the relationship climbs, in order' })
  rungs: BlueprintLadderRungOut[];
}

@Schema()
export class BlueprintCastOut {
  @Field(() => [BlueprintCastMemberOut], {
    minItems: CAST_MEMBERS_MIN,
    maxItems: CAST_MEMBERS_MAX,
    description: 'only the characters volume one needs, and never one that already exists',
  })
  members: BlueprintCastMemberOut[];

  @Field(() => [BlueprintLaterCastOut], { optional: true, maxItems: LATER_CAST_MAX, description: 'characters later volumes will need, one line each and no more' })
  later?: BlueprintLaterCastOut[];

  @Field(() => BlueprintLadderOut, { description: 'the relationship the novel turns on, as the rungs it climbs' })
  ladder: BlueprintLadderOut;
}

@Schema()
export class BlueprintPlaceOut {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  name: string;

  @Field(() => String, { enum: [...PLACE_KINDS] })
  kind: string;

  @Field(() => String, { enum: [...PLACE_DEPTHS], description: '“deep” only where volume one actually happens; everything else is a sketch' })
  detail: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX })
  summary: string;

  @Field({ optional: true, maxLength: VOLUME_ONE_NAME_MAX, description: 'where it is used, e.g. “arc 1” or “volume 2”' })
  usedIn?: string;
}

@Schema()
export class BlueprintBacklogOut {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'the idea that is worth keeping and not worth answering yet' })
  item: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'why no sentence in the next twenty chapters changes without it' })
  why: string;
}

@Schema()
export class BlueprintPlacesOut {
  @Field(() => [BlueprintPlaceOut], { minItems: PLACES_MIN, maxItems: PLACES_MAX })
  places: BlueprintPlaceOut[];

  @Field(() => [BlueprintBacklogOut], { optional: true, maxItems: BACKLOG_MAX, description: 'everything that changes no sentence before chapter twenty' })
  backlog?: BlueprintBacklogOut[];
}

@Schema()
export class BlueprintArcOut {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX })
  title: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'what this arc is for — what the novel cannot do without it' })
  purpose: string;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_LINE_MAX, description: 'the turn it ends on, stated as what is true after it that was not before' })
  turn: string;

  @Field(() => Integer, { minimum: ARC_CHAPTERS_MIN, maximum: ARC_CHAPTERS_MAX })
  chapters: number;

  @Field({ optional: true, maxLength: VOLUME_ONE_NAME_MAX, description: 'the relationship rung this arc lands, named exactly as the ladder names it' })
  rung?: string;
}

@Schema()
export class BlueprintArcsOut {
  @Field({ minLength: 1, maxLength: VOLUME_ONE_NAME_MAX, description: 'volume one as the spine named it' })
  volumeTitle: string;

  @Field(() => [BlueprintArcOut], { minItems: ARCS_MIN, maxItems: ARCS_MAX, description: 'volume one in order, covering all of it' })
  arcs: BlueprintArcOut[];
}

@Schema()
export class BlueprintVolumeOneSchema {
  @Field(() => BlueprintCastOut, { optional: true, description: 'omitted when the scope section does not ask for it' })
  cast?: BlueprintCastOut;

  @Field(() => BlueprintPlacesOut, { optional: true, description: 'omitted when the scope section does not ask for it' })
  places?: BlueprintPlacesOut;

  @Field(() => BlueprintArcsOut, { optional: true, description: 'omitted when the scope section does not ask for it' })
  arcs?: BlueprintArcsOut;

  @Field({ minLength: 1, maxLength: VOLUME_ONE_COACH_MAX, description: 'one or two plain sentences on what you built and what in the notebook drove it' })
  coachMessage: string;
}

export type BlueprintVolumeOneOutput = BlueprintVolumeOneSchema;
